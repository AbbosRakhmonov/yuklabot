import { MESSAGES } from "@/constants";
import { EPlatform } from "../enums/EPlatform";

/**
 * Determines the platform based on the URL
 *
 * @param url - The URL string to analyze
 * @returns The platform enum value
 * @throws Error if the URL is invalid or platform is not supported
 */
export const getPlatformByUrl = async (url: string): Promise<EPlatform> => {
  if (!url || typeof url !== "string") {
    throw new Error(MESSAGES.ERROR.INVALID_URL);
  }

  const parsedUrl = new URL(url);
  const hostname = parsedUrl.hostname.toLowerCase();

  // Remove 'www.' prefix if present for easier matching
  const normalizedHostname = hostname.replace(/^www\./, "");

  // YouTube
  if (
    hostname === "youtu.be" ||
    normalizedHostname === "youtube.com" ||
    normalizedHostname === "m.youtube.com" ||
    normalizedHostname === "youtube-nocookie.com" ||
    hostname.includes("youtube.com")
  ) {
    return EPlatform.YOUTUBE;
  }

  // Instagram
  if (hostname.includes("instagram.com")) {
    return EPlatform.INSTAGRAM;
  }

  // Facebook
  if (
    normalizedHostname === "facebook.com" ||
    normalizedHostname === "fb.com" ||
    normalizedHostname === "m.facebook.com" ||
    hostname.includes("facebook.com")
  ) {
    return EPlatform.FACEBOOK;
  }

  // Pinterest
  if (
    normalizedHostname === "pinterest.com" ||
    normalizedHostname === "pin.it" ||
    hostname.includes("pinterest.com")
  ) {
    return EPlatform.PINTEREST;
  }

  // TikTok
  if (
    normalizedHostname === "tiktok.com" ||
    normalizedHostname === "vm.tiktok.com" ||
    hostname.includes("tiktok.com")
  ) {
    return EPlatform.TIKTOK;
  }

  throw new Error(MESSAGES.ERROR.UNSUPPORTED_PLATFORM);
};
