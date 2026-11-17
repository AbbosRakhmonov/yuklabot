import crypto from "crypto";
import fs from "fs";
import { config } from "@/config/config";
import logger from "@/config/logger";

export interface ProxyEntry {
  // Short hash of the URL: safe to keep in the session (no password)
  id: string;
  url: string;
}

const SUPPORTED_PROTOCOLS = ["http:", "https:", "socks5:", "socks5h:", "socks:"];

/**
 * Proxy URL with the password hidden, for logs
 */
export const maskProxy = (proxy: ProxyEntry | null | undefined): string => {
  if (!proxy) return "direct";
  try {
    const url = new URL(proxy.url);
    if (url.password) url.password = "***";
    return `${url.protocol}//${url.username ? `${url.username}${url.password ? ":***" : ""}@` : ""}${url.host}`;
  } catch {
    return proxy.id;
  }
};

const parseList = (raw: string): string[] =>
  raw
    .split(/[\n,]/)
    .map((line) => line.replace(/#.*$/, "").trim())
    .filter(Boolean);

const loadProxies = (): ProxyEntry[] => {
  const urls = parseList(config.proxy.list);

  if (config.proxy.file) {
    try {
      urls.push(...parseList(fs.readFileSync(config.proxy.file, "utf8")));
    } catch (error) {
      logger.error("Failed to read PROXY_FILE", {
        file: config.proxy.file,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (config.tiktokProxy) urls.push(config.tiktokProxy);

  const entries = new Map<string, ProxyEntry>();
  for (const raw of urls) {
    // "host:port" without a scheme: treat as an HTTP proxy
    const withScheme = /^[a-z0-9]+:\/\//i.test(raw) ? raw : `http://${raw}`;
    let url: URL;
    try {
      url = new URL(withScheme);
    } catch {
      logger.warning("Invalid proxy skipped", { proxy: raw.replace(/:[^:@/]*@/, ":***@") });
      continue;
    }
    if (!SUPPORTED_PROTOCOLS.includes(url.protocol) || !url.port) {
      logger.warning("Unsupported proxy skipped (need http/https/socks5 and a port)", {
        proxy: `${url.protocol}//${url.host}`,
      });
      continue;
    }
    const id = crypto.createHash("sha1").update(withScheme).digest("hex").slice(0, 10);
    entries.set(id, { id, url: withScheme });
  }

  return [...entries.values()];
};

class ProxyPool {
  private readonly proxies: ProxyEntry[];
  // Proxy id -> time until which it is skipped
  private readonly cooldownUntil = new Map<string, number>();
  private cursor = 0;

  constructor(proxies: ProxyEntry[]) {
    this.proxies = proxies;
    if (proxies.length > 0) {
      logger.info(`Proxy pool: ${proxies.length} proxies`, {
        proxies: proxies.map(maskProxy),
      });
    }
  }

  get size(): number {
    return this.proxies.length;
  }

  getById(id: string | null | undefined): ProxyEntry | undefined {
    return id ? this.proxies.find((p) => p.id === id) : undefined;
  }

  /**
   * The order to try for one request: a few proxies, each request starting
   * at the next one (round-robin), then the server's own IP (null).
   * Proxies in cooldown are skipped unless every one of them is.
   */
  getAttemptOrder(exclude?: ProxyEntry | null): (ProxyEntry | null)[] {
    const now = Date.now();
    const candidates = this.proxies.filter((p) => p.id !== exclude?.id);
    let healthy = candidates.filter((p) => (this.cooldownUntil.get(p.id) ?? 0) <= now);
    if (healthy.length === 0 && !config.proxy.directFallback) healthy = candidates;

    const order: (ProxyEntry | null)[] = [];
    if (healthy.length > 0) {
      const start = this.cursor++ % healthy.length;
      const rotated = [...healthy.slice(start), ...healthy.slice(0, start)];
      order.push(...rotated.slice(0, config.proxy.maxAttempts));
    }

    // Direct (server IP) last, if allowed; always at least one attempt
    const directExcluded = exclude === null && order.length > 0;
    if ((config.proxy.directFallback || order.length === 0) && !directExcluded) {
      order.push(null);
    }
    return order;
  }

  markBad(proxy: ProxyEntry | null): void {
    if (!proxy || config.proxy.cooldownMs <= 0) return;
    this.cooldownUntil.set(proxy.id, Date.now() + config.proxy.cooldownMs);
  }

  markGood(proxy: ProxyEntry | null): void {
    if (proxy) this.cooldownUntil.delete(proxy.id);
  }
}

export const proxyPool = new ProxyPool(loadProxies());
