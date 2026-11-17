import { config } from "@/config/config";
import logger from "@/config/logger";
import { MESSAGES } from "@/constants";
import { EMediaType } from "@/enums/EMediaType";
import { IInstagramData } from "@/interfaces/IInstagramData";
import { BROWSER_USER_AGENT } from "@/utils/cdnInput";
import { UserError } from "@/utils/errors";
import { httpRequest } from "@/utils/proxy";

/**
 * Stories without our own cookies, through a third-party API
 * (INSTAGRAM_STORY_API, by default JerryCoder's: a front for SaveInsta).
 * It answers with dl.snapcdn.app links whose JWT `token` carries the original
 * Instagram CDN URL: that one is used when present, so the media itself
 * never passes through the third party.
 */

const STORY_API_TIMEOUT_MS = 30_000;

// Hosts a media URL may point to
const INSTAGRAM_CDN = /(^|\.)(cdninstagram\.com|fbcdn\.net)$/i;
const SNAPCDN = /(^|\.)snapcdn\.app$/i;

interface IStoryApiItem {
  type?: string; // "video" | "image" | "photo"
  url?: string;
  thumbnail?: string;
}

interface IStoryApiResponse {
  status?: string;
  error?: string;
  message?: string;
  data?: IStoryApiItem | IStoryApiItem[];
}

/**
 * The Instagram CDN URL inside a snapcdn link (or the URL itself if it
 * already is one); null for anything else
 */
export const resolveStoryMediaUrl = (raw: string | undefined): string | null => {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (INSTAGRAM_CDN.test(url.hostname)) return url.toString();
  if (!SNAPCDN.test(url.hostname)) return null;

  // The token is a JWT whose payload is { url, filename, exp, ... }
  try {
    const token = url.searchParams.get("token") ?? "";
    const payload = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString()) as {
      url?: string;
    };
    const inner = payload.url ? new URL(payload.url) : null;
    if (inner?.protocol === "https:" && INSTAGRAM_CDN.test(inner.hostname)) {
      return inner.toString();
    }
  } catch {
    // Not a readable token: the snapcdn link itself still works
  }
  return url.toString();
};

/**
 * /stories/{username}/{id}/
 */
const parseStoryPath = (pageUrl: string): { username: string; id: string } => {
  const [, , username = "", id = ""] = new URL(pageUrl).pathname.split("/");
  return { username, id };
};

export const fetchStoryViaApi = async (
  pageUrl: string,
  signal?: AbortSignal,
): Promise<IInstagramData> => {
  if (!config.instagramStoryApi) {
    throw new UserError(MESSAGES.ERROR.INSTAGRAM_STORY_UNSUPPORTED);
  }

  let body: IStoryApiResponse | null;
  let status: number;
  try {
    const response = await httpRequest(
      `${config.instagramStoryApi}/insta?url=${encodeURIComponent(pageUrl)}`,
      {
        headers: {
          accept: "application/json",
          "accept-encoding": "gzip, deflate, br",
          "user-agent": BROWSER_USER_AGENT,
        },
        timeoutMs: STORY_API_TIMEOUT_MS,
        signal,
      },
    );
    status = response.status;
    body = await response.json<IStoryApiResponse>().catch(() => null);
  } catch (error) {
    if (signal?.aborted) throw error;
    logger.error("Story API request failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw new UserError(MESSAGES.ERROR.INSTAGRAM_STORY_FAILED);
  }

  const items = body?.data ? (Array.isArray(body.data) ? body.data : [body.data]) : [];
  const item = items.find((i) => resolveStoryMediaUrl(i.url));

  if (body?.status !== "success" || !item) {
    logger.warning("Story API returned no media", {
      status,
      apiStatus: body?.status,
      error: body?.error || body?.message,
    });
    throw new UserError(MESSAGES.ERROR.INSTAGRAM_STORY_FAILED);
  }

  const mediaUrl = resolveStoryMediaUrl(item.url) as string;
  const thumbnail = resolveStoryMediaUrl(item.thumbnail) ?? undefined;
  const isVideo = item.type === "video";
  const { username, id } = parseStoryPath(pageUrl);

  return {
    id,
    shortcode: id,
    url: pageUrl,
    username,
    timestamp: Date.now() / 1000,
    media_type: isVideo ? EMediaType.VIDEO : EMediaType.IMAGE,
    video_url: isVideo ? mediaUrl : undefined,
    image_url: isVideo ? thumbnail : mediaUrl,
    thumbnail: isVideo ? thumbnail : mediaUrl,
    has_audio: isVideo,
    is_story: true,
  };
};
