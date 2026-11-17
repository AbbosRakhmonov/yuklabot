import fs from "fs/promises";
import path from "path";
import { config } from "@/config/config";
import logger from "@/config/logger";
import { MESSAGES } from "@/constants";
import { EMediaType } from "@/enums/EMediaType";
import { sanitizeUrl } from "@/helpers/sanitizeUrl";
import {
  IGalleryDlJsonResponse,
  IInstagramGalleryDlData,
} from "@/interfaces/IGalleryDlData";
import { IInstagramData } from "@/interfaces/IInstagramData";
import {
  fetchInstagramPost,
  getInstagramErrorContext,
  InstagramUnavailableError,
  resolveInstagramShareLink,
} from "@/services/instagram/instagramScraper";
import { parseInstagramUrl } from "@/services/instagram/instagramUrl";
import { fetchStoryViaApi } from "@/services/instagram/storyApi";
import {
  createDownloadFolder,
  getDownloadFolderPath,
  removeDownloadFolder,
} from "@/utils/downloadFolder";
import { BROWSER_USER_AGENT } from "@/utils/cdnInput";
import { UserError } from "@/utils/errors";
import {
  ProcessCancelledError,
  spawnProcessJson,
  spawnProcessOrThrow,
} from "@/utils/processManager";
import {
  BlockedError,
  maskProxy,
  ProxyEntry,
  proxyArgs,
  proxyPool,
  withProxyRotation,
} from "@/utils/proxy";

/**
 * Instagram without the account cookies: posts and reels come from the
 * endpoints Instagram serves to logged-out visitors (see instagramScraper),
 * through rotating proxies. Media is streamed from the CDN by the scenes.
 * Stories are the exception: there is no logged-out way to see them, so they
 * use INSTAGRAM_COOKIES_PATH (gallery-dl) if set, otherwise (or if that
 * fails) a third-party story API (see storyApi).
 */
export class InstagramService {
  url: string;
  data: IInstagramData | null = null;
  // Proxy the info came from (null: server IP), for CDN retries
  proxyId: string | null = null;
  folderName: string | null = null;

  constructor(url: string) {
    this.url = sanitizeUrl(url);
  }

  async getInfo(signal?: AbortSignal): Promise<IInstagramData> {
    const link = parseInstagramUrl(this.url);
    if (!link) throw new UserError(MESSAGES.ERROR.INSTAGRAM_UNSUPPORTED_LINK);

    if (link.kind === "story") return this.getStoryInfo(signal);

    let shortcode = link.kind === "post" ? link.shortcode : null;

    try {
      const { result, proxy } = await withProxyRotation(
        "Instagram post",
        async (proxy) => {
          let post = link;
          if (post.kind === "share") {
            const target = await resolveInstagramShareLink(post.path, proxy, signal);
            const resolved = target ? parseInstagramUrl(target) : null;
            if (resolved?.kind !== "post") {
              throw new BlockedError("Instagram share link did not redirect to a post");
            }
            post = resolved;
          }
          if (post.kind !== "post") throw new Error("Unreachable");
          shortcode = post.shortcode;
          return fetchInstagramPost(post.shortcode, this.url, post.isReel, proxy, signal);
        },
        { signal },
      );

      this.data = result;
      this.proxyId = proxy?.id ?? null;
      return result;
    } catch (error) {
      if (error instanceof ProcessCancelledError || error instanceof UserError) throw error;
      if (signal?.aborted) throw new ProcessCancelledError();
      if (!shortcode) throw error;

      // Tell the user why, if Instagram says so (private / age restricted)
      const reason = await getInstagramErrorContext(
        shortcode,
        proxyPool.getAttemptOrder()[0] ?? null,
      );
      if (reason === "private") throw new UserError(MESSAGES.ERROR.INSTAGRAM_PRIVATE);
      if (reason === "age_restricted") {
        throw new UserError(MESSAGES.ERROR.INSTAGRAM_AGE_RESTRICTED);
      }
      if (error instanceof InstagramUnavailableError) {
        throw new UserError(MESSAGES.ERROR.INSTAGRAM_NOT_FOUND);
      }
      throw error;
    }
  }

  /**
   * Extracts the audio track straight from the CDN video, without
   * re-encoding (Instagram uses AAC, which goes into .m4a as is); only the
   * audio is written to disk
   */
  async extractAudio(videoUrl: string, signal?: AbortSignal): Promise<string> {
    const name = `${this.data?.username || "instagram"}_${this.data?.shortcode || this.data?.id || "audio"}`;
    this.folderName = await createDownloadFolder(this.data?.shortcode || "instagram");
    const audioPath = path.join(
      getDownloadFolderPath(this.folderName),
      `${name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100)}.m4a`,
    );

    // Server IP first; then the proxy the info came from (ffmpeg only
    // speaks HTTP proxies)
    const attempts: (ProxyEntry | null)[] = [null];
    const proxy = proxyPool.getById(this.proxyId);
    if (proxy && /^https?:/.test(proxy.url)) attempts.push(proxy);

    let lastError: unknown;
    for (const attempt of attempts) {
      try {
        await spawnProcessOrThrow({
          command: config.ffmpeg,
          args: [
            ...(attempt ? ["-http_proxy", attempt.url] : []),
            // Not ffmpeg's default "Lavf/...", which CDNs may refuse
            "-user_agent",
            BROWSER_USER_AGENT,
            "-i",
            videoUrl,
            "-vn",
            "-c:a",
            "copy",
            "-y",
            audioPath,
          ],
          ignoreStdout: true,
          signal,
        });
        return audioPath;
      } catch (error) {
        if (error instanceof ProcessCancelledError) {
          await this.cleanupFolder();
          throw error;
        }
        lastError = error;
        logger.warning("Instagram audio extraction failed", {
          via: maskProxy(attempt),
          error: error instanceof Error ? error.message.slice(-500) : String(error),
        });
      }
    }

    await this.cleanupFolder();
    throw lastError;
  }

  /**
   * Safely removes the download folder if it exists, never throws
   */
  async cleanupFolder(): Promise<void> {
    await removeDownloadFolder(this.folderName);
  }

  // Stories: our cookies (gallery-dl) if configured, otherwise (or if they
  // fail) the third-party story API

  private async getStoryInfo(signal?: AbortSignal): Promise<IInstagramData> {
    const cookiesArgs = await this.getCookiesArgs();

    if (cookiesArgs) {
      try {
        return await this.getStoryWithCookies(cookiesArgs, signal);
      } catch (error) {
        if (error instanceof ProcessCancelledError || signal?.aborted) throw error;
        if (!config.instagramStoryApi) throw error;
        logger.warning("Story via cookies failed, trying the story API", {
          error: error instanceof Error ? error.message.slice(-500) : String(error),
        });
      }
    }

    this.data = await fetchStoryViaApi(this.url, signal);
    // The media URLs are Instagram's CDN, fetched from the server's IP
    this.proxyId = null;
    return this.data;
  }

  private async getStoryWithCookies(
    cookiesArgs: string[],
    signal?: AbortSignal,
  ): Promise<IInstagramData> {
    const { result: parsed, proxy } = await withProxyRotation(
      "Instagram story",
      (proxy) =>
        spawnProcessJson<IGalleryDlJsonResponse>({
          command: config.galleryDl,
          args: [this.url, "--dump-json", ...cookiesArgs, ...proxyArgs(proxy)],
          signal,
        }),
      { signal },
    );
    this.proxyId = proxy?.id ?? null;

    // gallery-dl returns [[2, {...post}], [3, "url", {...media}], ...]
    let postMetadata: IInstagramGalleryDlData | null = null;
    const mediaItems: IInstagramGalleryDlData[] = [];

    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        if (Array.isArray(item) && item.length >= 3) {
          const dataObj = item[2];
          if (
            typeof dataObj === "object" &&
            dataObj !== null &&
            (dataObj.video_url || dataObj.display_url)
          ) {
            mediaItems.push(dataObj as IInstagramGalleryDlData);
          }
        } else if (Array.isArray(item) && item.length === 2) {
          const dataObj = item[1];
          if (typeof dataObj === "object" && dataObj !== null) {
            postMetadata = dataObj as IInstagramGalleryDlData;
          }
        }
      }
    }

    // One story link is one item; a highlight link: its first item
    const story = mediaItems[0] ?? postMetadata;
    if (!story) {
      throw new UserError(MESSAGES.ERROR.INSTAGRAM_NOT_FOUND);
    }

    this.data = this.parseStory(story);
    return this.data;
  }

  private parseStory(story: IInstagramGalleryDlData): IInstagramData {
    const isVideo = !!(story.video_url || story.is_video);

    return {
      id: story.id || story.shortcode || "",
      shortcode: story.shortcode || "",
      url: this.url,
      title: story.title || story.caption?.substring(0, 100),
      caption: story.caption,
      username: story.username || story.owner_username || "",
      timestamp: story.timestamp || Date.now() / 1000,
      media_type: isVideo ? EMediaType.VIDEO : EMediaType.IMAGE,
      thumbnail: story.thumbnail || story.display_url,
      video_url: isVideo ? story.video_url || undefined : undefined,
      image_url: isVideo
        ? story.display_url || story.thumbnail || undefined
        : story.display_url || story.url || undefined,
      carousel_media: undefined,
      width: story.dimensions?.width || story.width,
      height: story.dimensions?.height || story.height,
      duration: story.video_duration,
      has_audio: isVideo,
      is_story: true,
    };
  }

  /**
   * gallery-dl cookies args, or null when no (readable) cookies file is set
   */
  private async getCookiesArgs(): Promise<string[] | null> {
    if (!config.instagramCookies) return null;

    try {
      await fs.access(config.instagramCookies);
    } catch {
      logger.error(
        `Instagram cookies file not found at: ${config.instagramCookies} (INSTAGRAM_COOKIES_PATH)`,
      );
      return null;
    }

    // Forward slashes for cross-platform compatibility
    return ["--cookies", config.instagramCookies.replace(/\\/g, "/")];
  }
}
