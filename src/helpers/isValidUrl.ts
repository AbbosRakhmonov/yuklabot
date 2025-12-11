/**
 * Validates if a string is a valid HTTP/HTTPS URL
 * Similar to Zod's z.httpUrl() validation
 *
 * @param url - String to validate
 * @returns true if valid HTTP/HTTPS URL, false otherwise
 *
 * @example
 * isValidUrl('https://example.com') // true
 * isValidUrl('http://example.com') // true
 * isValidUrl('ftp://example.com') // false
 * isValidUrl('not-a-url') // false
 */
export function isValidUrl(url: string): boolean {
  if (!url || typeof url !== "string") {
    return false;
  }

  try {
    const parsedUrl = new URL(url);

    // Check if protocol is http or https
    const validProtocols = ["http:", "https:"];
    if (!validProtocols.includes(parsedUrl.protocol)) {
      return false;
    }

    // Check if hostname exists
    if (!parsedUrl.hostname || parsedUrl.hostname.length === 0) {
      return false;
    }

    return true;
  } catch {
    // URL constructor throws if invalid
    return false;
  }
}
