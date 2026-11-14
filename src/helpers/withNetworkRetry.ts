import logger from "@/config/logger";

// Transient network/DNS errors raised by node-fetch when Telegraf streams a URL
const RETRYABLE_CODES = [
  "EAI_AGAIN",
  "ENOTFOUND",
  "ECONNRESET",
  "ETIMEDOUT",
  "ECONNREFUSED",
  "EPIPE",
];

const isRetryableError = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false;
  const code = (error as NodeJS.ErrnoException).code;
  if (code && RETRYABLE_CODES.includes(code)) return true;
  return RETRYABLE_CODES.some((c) => error.message.includes(c));
};

/**
 * Retries an action on transient network errors (e.g. DNS EAI_AGAIN).
 * The action must create a fresh Input (URL stream) on every call.
 */
export const withNetworkRetry = async <T>(
  action: () => Promise<T>,
  retries = 3,
  delayMs = 1500,
): Promise<T> => {
  for (let attempt = 1; ; attempt++) {
    try {
      return await action();
    } catch (error) {
      if (attempt > retries || !isRetryableError(error)) throw error;
      logger.warning("Network error, retrying", {
        attempt,
        error: error instanceof Error ? error.message : String(error),
      });
      await new Promise((r) => setTimeout(r, delayMs * attempt));
    }
  }
};
