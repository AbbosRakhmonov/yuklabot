import logger from "@/config/logger";
import { UserError } from "@/utils/errors";
import { ProcessCancelledError } from "@/utils/processManager";
import { isBlockingError, isPermanentError } from "./errors";
import { maskProxy, ProxyEntry, proxyPool } from "./proxyPool";

export interface ProxyRotationOptions {
  signal?: AbortSignal;
  // Proxy (or null = server IP) not to try again, e.g. one that just failed
  exclude?: ProxyEntry | null;
}

export interface ProxyRotationResult<T> {
  result: T;
  proxy: ProxyEntry | null;
}

/**
 * Runs `action` through a proxy; if the site blocks it or the proxy is dead,
 * tries the next proxy, finally the server's own IP.
 * Cancellation, user-facing errors (private post...) and errors no other IP
 * could fix are thrown right away.
 */
export const withProxyRotation = async <T>(
  label: string,
  action: (proxy: ProxyEntry | null) => Promise<T>,
  { signal, exclude }: ProxyRotationOptions = {},
): Promise<ProxyRotationResult<T>> => {
  const order = proxyPool.getAttemptOrder(exclude);
  let lastError: unknown;

  for (const [index, proxy] of order.entries()) {
    if (signal?.aborted) throw new ProcessCancelledError();

    try {
      const result = await action(proxy);
      proxyPool.markGood(proxy);
      if (index > 0) {
        logger.info(`${label}: succeeded via ${maskProxy(proxy)}`, { attempt: index + 1 });
      }
      return { result, proxy };
    } catch (error) {
      if (
        error instanceof ProcessCancelledError ||
        signal?.aborted ||
        error instanceof UserError ||
        isPermanentError(error)
      ) {
        throw error;
      }

      lastError = error;
      const blocked = isBlockingError(error);
      if (blocked) proxyPool.markBad(proxy);

      logger.warning(`${label}: failed via ${maskProxy(proxy)}`, {
        attempt: index + 1,
        of: order.length,
        blocked,
        error: (error instanceof Error ? error.message : String(error)).slice(-500),
      });
    }
  }

  throw lastError;
};
