import { Input } from "telegraf";
import { InputFile } from "telegraf/typings/core/types/typegram";
import logger from "@/config/logger";
import {
  httpRequest,
  HttpStatusError,
  maskProxy,
  ProxyEntry,
  proxyPool,
} from "@/utils/proxy";

const CDN_TIMEOUT_MS = 20_000;

// CDNs may refuse unknown clients (e.g. ffmpeg's default "Lavf/...")
export const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const CDN_HEADERS = {
  "user-agent": BROWSER_USER_AGENT,
  accept: "*/*",
};

/**
 * A CDN file (Instagram video...) as a stream Telegram uploads from: the bytes
 * pass through memory only, nothing is written to disk.
 * First from the server's IP (CDNs don't block it, and it costs no proxy
 * traffic); if that fails, through the proxy the metadata came from (some CDN
 * links only work from the IP that asked for them).
 */
export const openCdnStream = async (
  url: string,
  proxyId?: string | null,
  filename?: string,
): Promise<InputFile> => {
  const attempts: (ProxyEntry | null)[] = [null];
  const proxy = proxyPool.getById(proxyId);
  if (proxy) attempts.push(proxy);

  let lastError: unknown;
  for (const attempt of attempts) {
    try {
      const response = await httpRequest(url, {
        headers: CDN_HEADERS,
        proxy: attempt,
        timeoutMs: CDN_TIMEOUT_MS,
      });
      if (response.status !== 200) {
        response.body.resume();
        throw new HttpStatusError(response.status, url);
      }
      return Input.fromReadableStream(response.body, filename);
    } catch (error) {
      lastError = error;
      logger.warning("CDN stream failed", {
        via: maskProxy(attempt),
        host: new URL(url).host,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  throw lastError;
};

/**
 * Sends a CDN file by URL first (Telegram downloads it itself: no traffic
 * through the server); if Telegram can't fetch it (e.g. the CDN refuses
 * Telegram's IPs), streams it through the server instead (openCdnStream)
 */
export const sendWithCdnFallback = async <T>(
  url: string,
  proxyId: string | null | undefined,
  filename: string,
  send: (media: InputFile | string) => Promise<T>,
): Promise<T> => {
  try {
    return await send(Input.fromURL(url));
  } catch (error) {
    logger.warning("Telegram could not fetch the CDN URL, streaming it instead", {
      host: new URL(url).host,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const input = await openCdnStream(url, proxyId, filename);
  try {
    return await send(input);
  } catch (error) {
    destroyInput(input);
    throw error;
  }
};

/**
 * Closes the stream of an input that won't be sent (e.g. a failed retry)
 */
export const destroyInput = (input: InputFile | string | undefined): void => {
  if (input && typeof input === "object" && "source" in input) {
    const source = input.source as { destroy?: () => void };
    source.destroy?.();
  }
};
