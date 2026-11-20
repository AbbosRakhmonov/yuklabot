import { EPlatform } from "@/enums/EPlatform";
import { getPlatformByUrl } from "./getPlatformByUrl";
import { sanitizeUrl } from "./sanitizeUrl";

const URL_PATTERN = /https?:\/\/[^\s<>"']+/gi;
// Platforms the bot actually has a downloader for
const SUPPORTED = new Set<EPlatform>([EPlatform.YOUTUBE, EPlatform.INSTAGRAM, EPlatform.TIKTOK, EPlatform.FACEBOOK]);

/**
 * First link in free text that the bot can download, e.g. a group message
 * "look at this https://..." or an inline query.
 */
export async function extractSupportedUrl(text: string | undefined): Promise<string | undefined> {
  for (const match of text?.match(URL_PATTERN) ?? []) {
    try {
      const url = sanitizeUrl(match);
      if (SUPPORTED.has(await getPlatformByUrl(url))) return url;
    } catch {
      // Not a link we handle, try the next one
    }
  }
  return undefined;
}

/** Spellings the same link may be cached under (with/without query and trailing slash) */
export function urlVariants(url: string): string[] {
  const parsed = new URL(url);
  const bare = `${parsed.origin}${parsed.pathname}`;
  const variants = new Set([url, bare, bare.replace(/\/+$/, ""), bare.endsWith("/") ? bare : `${bare}/`]);
  return [...variants];
}
