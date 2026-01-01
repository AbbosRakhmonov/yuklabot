import { MESSAGES } from "@/constants";
import { EPlatform } from "../enums/EPlatform";
import { isValidUrl } from "./isValidUrl";

/**
 * Allowed domains for each platform (exact match or subdomain)
 */
const PLATFORM_DOMAINS = {
  [EPlatform.YOUTUBE]: [
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "youtu.be",
    "youtube-nocookie.com",
  ],
  [EPlatform.INSTAGRAM]: [
    "instagram.com",
    "www.instagram.com",
    "m.instagram.com",
  ],
  [EPlatform.FACEBOOK]: [
    "facebook.com",
    "www.facebook.com",
    "m.facebook.com",
    "fb.com",
    "www.fb.com",
  ],
  [EPlatform.PINTEREST]: ["pinterest.com", "www.pinterest.com", "pin.it"],
  [EPlatform.TIKTOK]: ["tiktok.com", "www.tiktok.com", "vm.tiktok.com"],
} as const;

/**
 * Checks if a hostname matches any of the allowed domains for a platform
 * Uses exact match or subdomain validation (e.g., "www.youtube.com" matches "youtube.com")
 */
function matchesPlatformDomain(
  hostname: string,
  allowedDomains: readonly string[]
): boolean {
  const normalizedHostname = hostname.toLowerCase().replace(/^www\./, "");

  for (const domain of allowedDomains) {
    const normalizedDomain = domain.toLowerCase().replace(/^www\./, "");

    // Exact match
    if (normalizedHostname === normalizedDomain) {
      return true;
    }

    // Subdomain match (e.g., "m.youtube.com" matches "youtube.com")
    // But NOT "youtube.com.evil.com"
    if (normalizedHostname.endsWith(`.${normalizedDomain}`)) {
      return true;
    }
  }

  return false;
}

/**
 * Determines the platform based on the URL
 *
 * @param url - The URL string to analyze
 * @returns The platform enum value
 * @throws Error if the URL is invalid or platform is not supported
 */
export const getPlatformByUrl = async (url: string): Promise<EPlatform> => {
  // Basic type check
  if (!url || typeof url !== "string") {
    throw new Error(MESSAGES.ERROR.INVALID_URL);
  }

  // Validate URL format and security
  if (!isValidUrl(url)) {
    throw new Error(MESSAGES.ERROR.INVALID_URL);
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error(MESSAGES.ERROR.INVALID_URL);
  }

  const hostname = parsedUrl.hostname.toLowerCase();

  // Check each platform with secure domain matching
  for (const [platform, domains] of Object.entries(PLATFORM_DOMAINS)) {
    if (matchesPlatformDomain(hostname, domains)) {
      return platform as EPlatform;
    }
  }

  throw new Error(MESSAGES.ERROR.UNSUPPORTED_PLATFORM);
};
