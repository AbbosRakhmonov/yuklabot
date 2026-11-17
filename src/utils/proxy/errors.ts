/**
 * The site refused us (rate limit, "login required", bot check) or the
 * proxy/network failed: another IP may well work
 */
export class BlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BlockedError";
  }
}

/**
 * The content itself is unavailable (deleted, private...): another IP
 * won't help, so the rotation stops
 */
export class PermanentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentError";
  }
}

const NETWORK_CODES = [
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "EAI_AGAIN",
  "ENOTFOUND",
  "EPIPE",
  "ERR_SOCKET",
  "ERR_TLS",
  "ProxyError",
];

// yt-dlp / gallery-dl / ffmpeg messages that mean "this IP is blocked"
const BLOCKED_PATTERNS = [
  /sign in to confirm/i,
  /not a bot/i,
  /HTTP Error 4(01|03|29)/i,
  /\b(401|403|429)\b.*(Forbidden|Unauthorized|Too Many Requests)/i,
  /Too Many Requests/i,
  /rate[- ]?limit/i,
  /login[ _]required/i,
  /please wait a few minutes/i,
  /checkpoint/i,
  /Unable to connect to proxy/i,
  /ProxyError|Tunnel connection failed|proxy.*(refused|failed|error)/i,
  /Connection (reset|refused|aborted)|timed out|Read timed out/i,
  /Unable to download webpage/i,
  /Failed to resolve|Name or service not known|getaddrinfo/i,
  /SSL|certificate|EOF occurred/i,
  /IP address is blocked|blocked in your region|not available in your country/i,
];

// Retrying with another IP can't help with these
const PERMANENT_PATTERNS = [
  /Unsupported URL/i,
  /is not a valid URL/i,
  /Private video/i,
  /has been removed/i,
  /account (has been|was) terminated/i,
  /members-only|Join this channel/i,
  /confirm your age/i,
  /Spawning .* failed/i,
];

const messageOf = (error: unknown): string =>
  error instanceof Error ? `${error.message} ${(error as NodeJS.ErrnoException).code ?? ""}` : String(error);

export const isBlockingError = (error: unknown): boolean => {
  if (error instanceof BlockedError) return true;
  const message = messageOf(error);
  return (
    NETWORK_CODES.some((code) => message.includes(code)) ||
    BLOCKED_PATTERNS.some((re) => re.test(message))
  );
};

export const isPermanentError = (error: unknown): boolean =>
  error instanceof PermanentError ||
  (!(error instanceof BlockedError) &&
    PERMANENT_PATTERNS.some((re) => re.test(messageOf(error))));
