import http from "http";
import https from "https";
import net from "net";
import tls from "tls";
import zlib from "zlib";
import { Readable } from "stream";
import { BlockedError } from "./errors";
import { ProxyEntry } from "./proxyPool";

/**
 * A small HTTP(S) client that can go through an HTTP(S) proxy (CONNECT) or a
 * SOCKS5 proxy, without extra dependencies. Every request is tunnelled, so
 * the target only sees the proxy's IP.
 */

const DEFAULT_TIMEOUT_MS = 15_000;
// A streamed body (CDN file) may pause, but not for longer than this
const STREAM_IDLE_TIMEOUT_MS = 60_000;
const MAX_TEXT_SIZE = 20 * 1024 * 1024;

const directAgent = new https.Agent({ keepAlive: true, maxSockets: 64 });

export interface HttpRequestOptions {
  method?: "GET" | "POST" | "HEAD";
  headers?: Record<string, string | undefined>;
  body?: string;
  proxy?: ProxyEntry | null;
  // Until the response headers arrive
  timeoutMs?: number;
  signal?: AbortSignal;
  // 0: return the 3xx response as is
  maxRedirects?: number;
}

export interface HttpResponse {
  status: number;
  headers: http.IncomingHttpHeaders;
  url: string;
  // Decoded (gzip/deflate/br) body stream
  body: Readable;
  text(): Promise<string>;
  json<T = unknown>(): Promise<T>;
}

export class HttpStatusError extends Error {
  constructor(
    public readonly status: number,
    public readonly url: string,
  ) {
    super(`HTTP ${status} from ${new URL(url).host}`);
    this.name = "HttpStatusError";
  }
}

/**
 * Reads from a socket until the given number of bytes is available
 */
class SocketReader {
  private buffer = Buffer.alloc(0);
  private waiter: (() => void) | null = null;
  private error: Error | null = null;

  constructor(private readonly socket: net.Socket) {
    socket.on("data", this.onData);
    socket.once("error", this.onError);
    socket.once("close", this.onClose);
  }

  private onData = (chunk: Buffer) => {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    this.waiter?.();
  };

  private onError = (error: Error) => {
    this.error = error;
    this.waiter?.();
  };

  private onClose = () => {
    this.error ??= new Error("ProxyError: proxy closed the connection");
    this.waiter?.();
  };

  async read(size: number): Promise<Buffer> {
    while (this.buffer.length < size) {
      if (this.error) throw this.error;
      await new Promise<void>((resolve) => (this.waiter = resolve));
      this.waiter = null;
    }
    const out = this.buffer.subarray(0, size);
    this.buffer = this.buffer.subarray(size);
    return out;
  }

  async readUntil(marker: string, limit = 16 * 1024): Promise<Buffer> {
    for (;;) {
      const index = this.buffer.indexOf(marker);
      if (index !== -1) return this.read(index + marker.length);
      if (this.buffer.length > limit) throw new Error("ProxyError: response too long");
      if (this.error) throw this.error;
      await new Promise<void>((resolve) => (this.waiter = resolve));
      this.waiter = null;
    }
  }

  /**
   * Stops reading and gives back whatever was read past the handshake
   */
  release(): void {
    this.socket.off("data", this.onData);
    this.socket.off("error", this.onError);
    this.socket.off("close", this.onClose);
    if (this.buffer.length > 0) this.socket.unshift(this.buffer);
  }
}

const connectSocket = (proxy: URL, timeoutMs: number): Promise<net.Socket> =>
  new Promise((resolve, reject) => {
    const port = Number(proxy.port);
    const socket =
      proxy.protocol === "https:"
        ? tls.connect({ host: proxy.hostname, port, servername: proxy.hostname })
        : net.connect({ host: proxy.hostname, port });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error("ProxyError: connect timed out ETIMEDOUT"));
    }, timeoutMs);
    socket.once(proxy.protocol === "https:" ? "secureConnect" : "connect", () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.once("error", (error) => {
      clearTimeout(timer);
      reject(new Error(`ProxyError: ${error.message}`));
    });
  });

const httpConnect = async (
  socket: net.Socket,
  proxy: URL,
  host: string,
  port: number,
): Promise<void> => {
  const auth = proxy.username
    ? `Proxy-Authorization: Basic ${Buffer.from(
        `${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password)}`,
      ).toString("base64")}\r\n`
    : "";
  socket.write(`CONNECT ${host}:${port} HTTP/1.1\r\nHost: ${host}:${port}\r\n${auth}\r\n`);

  const reader = new SocketReader(socket);
  try {
    const head = (await reader.readUntil("\r\n\r\n")).toString("latin1");
    const status = Number(head.split(" ")[1]);
    if (status !== 200) {
      throw new Error(`ProxyError: CONNECT answered ${status || head.split("\r\n")[0]}`);
    }
  } finally {
    reader.release();
  }
};

const SOCKS_ERRORS: Record<number, string> = {
  1: "general failure",
  2: "connection not allowed",
  3: "network unreachable",
  4: "host unreachable",
  5: "connection refused",
  6: "TTL expired",
  7: "command not supported",
  8: "address type not supported",
};

const socks5Connect = async (
  socket: net.Socket,
  proxy: URL,
  host: string,
  port: number,
): Promise<void> => {
  const reader = new SocketReader(socket);
  try {
    const user = decodeURIComponent(proxy.username);
    const pass = decodeURIComponent(proxy.password);
    // Greeting: no auth, or username/password
    socket.write(Buffer.from(user ? [5, 2, 0, 2] : [5, 1, 0]));
    const [version, method] = await reader.read(2);
    if (version !== 5) throw new Error("ProxyError: not a SOCKS5 proxy");

    if (method === 2) {
      const u = Buffer.from(user);
      const p = Buffer.from(pass);
      socket.write(Buffer.concat([Buffer.from([1, u.length]), u, Buffer.from([p.length]), p]));
      const [, status] = await reader.read(2);
      if (status !== 0) throw new Error("ProxyError: SOCKS5 authentication failed");
    } else if (method !== 0) {
      throw new Error("ProxyError: SOCKS5 proxy wants an unsupported auth method");
    }

    // CONNECT by domain name: the proxy resolves it
    const hostBuffer = Buffer.from(host);
    const portBuffer = Buffer.alloc(2);
    portBuffer.writeUInt16BE(port);
    socket.write(
      Buffer.concat([Buffer.from([5, 1, 0, 3, hostBuffer.length]), hostBuffer, portBuffer]),
    );

    const [, reply, , addressType] = await reader.read(4);
    if (reply !== 0) {
      throw new Error(`ProxyError: SOCKS5 ${SOCKS_ERRORS[reply] ?? `error ${reply}`}`);
    }
    const addressLength =
      addressType === 1 ? 4 : addressType === 4 ? 16 : (await reader.read(1))[0];
    await reader.read(addressLength + 2);
  } finally {
    reader.release();
  }
};

/**
 * A TLS (or plain) socket to host:port, tunnelled through the proxy
 */
const openTunnel = async (
  proxyEntry: ProxyEntry,
  target: URL,
  timeoutMs: number,
): Promise<net.Socket> => {
  const proxy = new URL(proxyEntry.url);
  const isTls = target.protocol === "https:";
  const port = Number(target.port) || (isTls ? 443 : 80);

  const socket = await connectSocket(proxy, timeoutMs);
  try {
    const handshake = proxy.protocol.startsWith("socks")
      ? socks5Connect(socket, proxy, target.hostname, port)
      : httpConnect(socket, proxy, target.hostname, port);
    let timer: NodeJS.Timeout | undefined;
    await Promise.race([
      handshake,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("ProxyError: handshake timed out ETIMEDOUT")),
          timeoutMs,
        );
      }),
    ]).finally(() => clearTimeout(timer));
  } catch (error) {
    socket.destroy();
    throw error;
  }

  if (!isTls) return socket;

  return new Promise((resolve, reject) => {
    const secure = tls.connect({
      socket,
      servername: target.hostname,
      ALPNProtocols: ["http/1.1"],
    });
    secure.once("secureConnect", () => resolve(secure));
    secure.once("error", (error) => {
      socket.destroy();
      reject(error);
    });
  });
};

const decodeBody = (response: http.IncomingMessage): Readable => {
  switch (response.headers["content-encoding"]) {
    case "gzip":
      return response.pipe(zlib.createGunzip());
    case "deflate":
      return response.pipe(zlib.createInflate());
    case "br":
      return response.pipe(zlib.createBrotliDecompress());
    default:
      return response;
  }
};

const readText = async (body: Readable): Promise<string> => {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of body) {
    size += chunk.length;
    if (size > MAX_TEXT_SIZE) {
      body.destroy();
      throw new Error("Response body too large");
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
};

const requestOnce = (
  url: URL,
  options: HttpRequestOptions,
): Promise<http.IncomingMessage> =>
  new Promise((resolve, reject) => {
    const { method = "GET", headers = {}, body, proxy, signal } = options;
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const isTls = url.protocol === "https:";

    const cleanHeaders: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
      if (value !== undefined) cleanHeaders[key] = value;
    }
    if (body !== undefined) {
      cleanHeaders["content-length"] = String(Buffer.byteLength(body));
    }

    let settled = false;
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      request.destroy();
      reject(error);
    };

    const request = (isTls ? https : http).request({
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port || undefined,
      path: `${url.pathname}${url.search}`,
      method,
      headers: cleanHeaders,
      servername: url.hostname,
      ...(proxy
        ? {
            // No agent: Node then uses createConnection (async form)
            createConnection: (
              _opts: unknown,
              callback: (error: Error | null, socket?: net.Socket) => void,
            ) => {
              openTunnel(proxy, url, timeoutMs).then(
                (socket) => {
                  // Timed out / aborted meanwhile
                  if (settled && request.destroyed) socket.destroy();
                  else callback(null, socket);
                },
                (error) => callback(error),
              );
              return undefined;
            },
          }
        : { agent: isTls ? directAgent : undefined }),
    } as https.RequestOptions);

    const timer = setTimeout(
      () => fail(new Error(`Request to ${url.host} timed out ETIMEDOUT`)),
      timeoutMs,
    );
    const onAbort = () => fail(new Error("Request aborted"));
    signal?.addEventListener("abort", onAbort, { once: true });

    request.once("error", fail);
    request.once("response", (response) => {
      if (settled) {
        response.destroy();
        return;
      }
      settled = true;
      clearTimeout(timer);
      // Abort keeps working while the body is read
      response.once("close", () => signal?.removeEventListener("abort", onAbort));
      response.setTimeout?.(STREAM_IDLE_TIMEOUT_MS, () =>
        response.destroy(new Error("Body stream idle timeout ETIMEDOUT")),
      );
      resolve(response);
    });

    if (body !== undefined) request.write(body);
    request.end();
  });

/**
 * Sends a request, optionally through a proxy, following up to
 * `maxRedirects` redirects (default 5)
 */
export const httpRequest = async (
  urlString: string,
  options: HttpRequestOptions = {},
): Promise<HttpResponse> => {
  let url = new URL(urlString);
  let redirectsLeft = options.maxRedirects ?? 5;
  let requestOptions = options;

  for (;;) {
    const response = await requestOnce(url, requestOptions);
    const status = response.statusCode ?? 0;
    const location = response.headers.location;

    if (status >= 300 && status < 400 && location && redirectsLeft > 0) {
      response.resume();
      redirectsLeft--;
      url = new URL(location, url);
      // Like browsers: a redirected POST becomes a GET without a body
      if (status !== 307 && status !== 308) {
        requestOptions = { ...requestOptions, method: "GET", body: undefined };
      }
      continue;
    }

    const body = decodeBody(response);
    const finalUrl = url.toString();
    return {
      status,
      headers: response.headers,
      url: finalUrl,
      body,
      text: () => readText(body),
      json: async <T>() => JSON.parse(await readText(body)) as T,
    };
  }
};

/**
 * GET/POST and read the body as text; 429 throws BlockedError, any other
 * status is returned for the caller to judge
 */
export const fetchText = async (
  url: string,
  options: HttpRequestOptions = {},
): Promise<{
  status: number;
  text: string;
  headers: http.IncomingHttpHeaders;
  // After redirects
  url: string;
}> => {
  const response = await httpRequest(url, options);
  const text = await response.text();
  if (response.status === 429) {
    throw new BlockedError(`HTTP 429 Too Many Requests from ${new URL(url).host}`);
  }
  return { status: response.status, text, headers: response.headers, url: response.url };
};
