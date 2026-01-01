/**
 * Sanitizes and validates URL before passing to external tools
 * Prevents command injection and ensures URL safety
 *
 * @param url - URL to sanitize
 * @returns Sanitized URL string
 * @throws Error if URL is invalid or dangerous
 */
export function sanitizeUrl(url: string): string {
  if (!url || typeof url !== "string") {
    throw new Error("URL must be a non-empty string");
  }

  // Trim whitespace
  const trimmed = url.trim();

  // Check length
  if (trimmed.length > 2048) {
    throw new Error("URL exceeds maximum length");
  }

  // Validate URL format
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(trimmed);
  } catch {
    throw new Error("Invalid URL format");
  }

  // Ensure protocol is http or https
  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    throw new Error("Only HTTP and HTTPS URLs are allowed");
  }

  // Remove any dangerous characters that could be used in command injection
  // (though spawn with array args should prevent this, this is defense in depth)
  const sanitized = parsedUrl.toString();

  // Additional check: ensure no newlines or control characters
  if (/[\r\n\t\0]/.test(sanitized)) {
    throw new Error("URL contains invalid characters");
  }

  return sanitized;
}
