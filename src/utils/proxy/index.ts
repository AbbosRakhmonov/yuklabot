import { ProxyEntry } from "./proxyPool";

export { maskProxy, proxyPool } from "./proxyPool";
export type { ProxyEntry } from "./proxyPool";
export { withProxyRotation } from "./withProxyRotation";
export { BlockedError, isBlockingError, PermanentError } from "./errors";
export { fetchText, httpRequest, HttpStatusError } from "./httpClient";
export type { HttpRequestOptions, HttpResponse } from "./httpClient";

/**
 * `--proxy` for yt-dlp / gallery-dl (same syntax in both); none for direct
 */
export const proxyArgs = (proxy: ProxyEntry | null): string[] =>
  proxy ? ["--proxy", proxy.url] : [];
