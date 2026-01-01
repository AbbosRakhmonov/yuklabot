/**
 * Validates if a string is a valid HTTP/HTTPS URL with security checks
 *
 * @param url - String to validate
 * @returns true if valid HTTP/HTTPS URL, false otherwise
 */
export function isValidUrl(url: string): boolean {
  if (!url || typeof url !== "string") {
    return false;
  }

  // Check URL length (prevent DoS)
  const MAX_URL_LENGTH = 2048; // RFC 7230 recommendation
  if (url.length > MAX_URL_LENGTH) {
    return false;
  }

  try {
    const parsedUrl = new URL(url);

    // Check if protocol is http or https (block dangerous schemes)
    const validProtocols = ["http:", "https:"];
    if (!validProtocols.includes(parsedUrl.protocol)) {
      return false;
    }

    // Check if hostname exists
    if (!parsedUrl.hostname || parsedUrl.hostname.length === 0) {
      return false;
    }

    // Block localhost and private IP addresses (SSRF protection)
    const hostname = parsedUrl.hostname.toLowerCase();
    const blockedHosts = [
      "localhost",
      "127.0.0.1",
      "0.0.0.0",
      "::1",
      "0:0:0:0:0:0:0:1",
    ];

    if (blockedHosts.includes(hostname)) {
      return false;
    }

    // Block private IP ranges
    if (
      /^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.)/.test(hostname) ||
      /^\[?::ffff:(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.)/.test(hostname)
    ) {
      return false;
    }

    // Validate hostname format (basic check)
    if (
      !/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i.test(
        hostname
      )
    ) {
      return false;
    }

    return true;
  } catch {
    // URL constructor throws if invalid
    return false;
  }
}
