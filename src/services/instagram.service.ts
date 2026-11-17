import { config } from "@/config/config";
import {
  IInstagramData,
  IInstagramMediaItem,
} from "@/interfaces/IInstagramData";
import {
  IInstagramGalleryDlData,
  IGalleryDlJsonResponse,
} from "@/interfaces/IGalleryDlData";
import fs from "fs/promises";
import { EMediaType } from "@/enums/EMediaType";
import { sanitizeUrl } from "@/helpers/sanitizeUrl";
import {
  createDownloadFolder,
  getDownloadFolderPath,
  removeDownloadFolder,
} from "@/utils/downloadFolder";
import {
  spawnProcessJson,
  spawnProcessOrThrow,
} from "@/utils/processManager";

export class InstagramService {
  url: string;
  data: IInstagramData | null = null;
  galleryDlData: IInstagramGalleryDlData | null = null;
  galleryDlRawData: IGalleryDlJsonResponse | null = null;
  folderName: string | null = null;

  constructor(url: string) {
    this.url = sanitizeUrl(url);
  }

  /**
   * Get Instagram post/reel/story information using gallery-dl
   */
  async getInfo(): Promise<IInstagramData> {
    const parsed = await spawnProcessJson<IGalleryDlJsonResponse>({
      command: config.galleryDl,
      args: [this.url, "--dump-json", ...(await this.getCookiesArgs())],
    });

    // Store raw data
    this.galleryDlRawData = parsed;

    // gallery-dl returns array of arrays: [[2, {...}], [3, "url", {...}], ...]
    // For carousel posts: [2, post_metadata] followed by multiple [3, "url", media_item]
    // We need to collect post metadata and all carousel items
    let postMetadata: IInstagramGalleryDlData | null = null;
    const carouselItems: IInstagramGalleryDlData[] = [];

    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        if (Array.isArray(item) && item.length >= 3) {
          // Format: [status_code, url_string, data_object] - media item
          const dataObj = item[2];
          if (
            typeof dataObj === "object" &&
            dataObj !== null &&
            (dataObj.video_url || dataObj.display_url)
          ) {
            carouselItems.push(dataObj as IInstagramGalleryDlData);
          }
        } else if (Array.isArray(item) && item.length === 2) {
          // Format: [status_code, data_object] - post metadata
          const dataObj = item[1];
          if (typeof dataObj === "object" && dataObj !== null) {
            postMetadata = dataObj as IInstagramGalleryDlData;
          }
        }
      }
    }

    // Determine the final jsonData structure
    let jsonData: IInstagramGalleryDlData | null = null;

    // Check if this is a story (stories should not have carousel_media)
    const isStory =
      postMetadata?.type === "story" ||
      postMetadata?.subcategory === "story" ||
      (carouselItems.length > 0 &&
        (carouselItems[0].type === "story" ||
          carouselItems[0].subcategory === "story"));

    // Check if this is a reel (reels should not have carousel_media)
    const isReel =
      postMetadata?.type === "reel" ||
      postMetadata?.subcategory === "reel" ||
      (carouselItems.length > 0 &&
        (carouselItems[0].type === "reel" ||
          carouselItems[0].subcategory === "reel"));

    if (isStory) {
      // For stories: use the first item to determine video/image type
      const storyData =
        carouselItems.length > 0 ? carouselItems[0] : postMetadata;
      if (storyData) {
        jsonData = {
          ...storyData,
          // Don't add carousel_media for stories
        };
      }
    } else if (isReel) {
      // For reels: use the first item (reels don't have carousel_media)
      const reelData =
        carouselItems.length > 0 ? carouselItems[0] : postMetadata;
      if (reelData) {
        jsonData = {
          ...reelData,
          // Don't add carousel_media for reels
        };
      }
    } else if (carouselItems.length > 0) {
      // Carousel post: merge post metadata with carousel items (only for POST type)
      if (postMetadata) {
        // Use post metadata as base and add carousel items
        jsonData = {
          ...postMetadata,
          carousel_media: carouselItems,
        };
      } else {
        // Fallback: use first carousel item as base
        jsonData = {
          ...carouselItems[0],
          carousel_media: carouselItems,
        };
      }
    } else if (postMetadata) {
      // Single post: use post metadata
      jsonData = postMetadata;
    }

    if (!jsonData) {
      throw new Error(
        "No valid Instagram data found in gallery-dl output",
      );
    }

    // Store structured data
    this.galleryDlData = jsonData;
    this.data = this.parseInstagramData(jsonData);

    return this.data;
  }

  /**
   * Parse gallery-dl JSON output to IInstagramData format
   */
  private parseInstagramData(
    jsonData: IInstagramGalleryDlData,
  ): IInstagramData {
    const detectedType = this.detectMediaType(jsonData);

    // For stories, detect if it's video or image based on content
    let mediaType = detectedType;
    let videoUrl: string | undefined;
    let imageUrl: string | undefined;
    let carouselMedia: IInstagramMediaItem[] | undefined = undefined;

    if (detectedType === EMediaType.STORY) {
      // For stories: identify if video or image
      if (jsonData.video_url || jsonData.is_video) {
        mediaType = EMediaType.VIDEO;
        videoUrl = jsonData.video_url || undefined;
        imageUrl = jsonData.display_url || jsonData.thumbnail || undefined;
      } else {
        mediaType = EMediaType.IMAGE;
        imageUrl = jsonData.display_url || jsonData.url || undefined;
      }
      // Don't add carousel_media for stories
    } else if (detectedType === EMediaType.REEL) {
      // For reels: don't add carousel_media
      videoUrl = jsonData.video_url || undefined;
      imageUrl = jsonData.url || jsonData.display_url;
    } else {
      // For posts only: include carousel_media if available
      carouselMedia = this.parseCarouselMedia(jsonData);
      videoUrl = jsonData.video_url || undefined;
      imageUrl = jsonData.url || jsonData.display_url;
    }

    const hasAudio = this.detectHasAudio(mediaType);

    return {
      id: jsonData.id || jsonData.shortcode || "",
      shortcode: jsonData.shortcode || "",
      url: jsonData.url || this.url,
      title: jsonData.title || jsonData.caption?.substring(0, 100),
      caption: jsonData.caption,
      username: jsonData.username || jsonData.owner_username || "",
      timestamp: jsonData.timestamp || Date.now() / 1000,
      media_type: mediaType,
      thumbnail: jsonData.thumbnail || jsonData.display_url,
      video_url: videoUrl,
      image_url: imageUrl,
      carousel_media: carouselMedia,
      width: jsonData.dimensions?.width || jsonData.width,
      height: jsonData.dimensions?.height || jsonData.height,
      duration: jsonData.video_duration,
      has_audio: hasAudio,
    };
  }

  /**
   * Detect media type from Instagram data
   */
  private detectMediaType(jsonData: IInstagramGalleryDlData): EMediaType {
    // Check type/subcategory from gallery-dl
    if (jsonData.type === "reel" || jsonData.subcategory === "reel") {
      return EMediaType.REEL;
    }

    if (jsonData.type === "story" || jsonData.subcategory === "story") {
      return EMediaType.STORY;
    }

    return EMediaType.POST;
  }

  /**
   * Detect if media has audio (for video types)
   */
  private detectHasAudio(mediaType: EMediaType): boolean {
    // Only videos/reels can have audio
    // Note: Stories are converted to VIDEO or IMAGE before this is called
    if (mediaType !== EMediaType.VIDEO && mediaType !== EMediaType.REEL) {
      return false;
    }

    // If it's a video, assume it has audio (Instagram videos usually do)
    return true;
  }

  /**
   * Parse carousel media items
   * Only for POST type - stories and reels should not have carousel_media
   */
  private parseCarouselMedia(
    jsonData: IInstagramGalleryDlData,
  ): IInstagramMediaItem[] | undefined {
    // Don't parse carousel_media for stories
    if (jsonData.type === "story" || jsonData.subcategory === "story") {
      return undefined;
    }

    // Don't parse carousel_media for reels
    if (jsonData.type === "reel" || jsonData.subcategory === "reel") {
      return undefined;
    }

    // Primary: carousel_media from gallery-dl (IInstagramGalleryDlData[])
    if (jsonData.carousel_media && Array.isArray(jsonData.carousel_media)) {
      return jsonData.carousel_media.map((item: IInstagramGalleryDlData) => ({
        id: item.media_id || item.id || "",
        media_type:
          item.is_video || item.video_url ? EMediaType.VIDEO : EMediaType.IMAGE,
        image_url: item.display_url || item.url,
        video_url: item.video_url || undefined,
        thumbnail: item.display_url || item.thumbnail,
        width: item.dimensions?.width || item.width,
        height: item.dimensions?.height || item.height,
        has_audio: item.is_video || item.video_url ? true : false,
      }));
    }

    // Fallback: edge_sidecar_to_children from Instagram API (if needed)
    if (jsonData.edge_sidecar_to_children?.edges) {
      const items: IInstagramMediaItem[] = [];
      for (const edge of jsonData.edge_sidecar_to_children.edges) {
        const node = edge.node;
        if (node) {
          items.push({
            id: node.id || "",
            media_type:
              node.is_video || node.video_url
                ? EMediaType.VIDEO
                : EMediaType.IMAGE,
            image_url: node.display_url || node.url,
            video_url: node.video_url || undefined,
            thumbnail: node.display_url || node.thumbnail,
            width: node.dimensions?.width || node.width,
            height: node.dimensions?.height || node.height,
            has_audio: node.is_video || node.video_url ? true : false,
          });
        }
      }
      return items.length > 0 ? items : undefined;
    }

    return undefined;
  }

  /**
   * Returns gallery-dl cookies args, throws if cookies are not configured
   */
  private async getCookiesArgs(): Promise<string[]> {
    if (!config.instagramCookies) {
      throw new Error("Instagram cookies are not configured");
    }

    try {
      await fs.access(config.instagramCookies);
    } catch {
      throw new Error(
        `Instagram cookies file not found at: ${config.instagramCookies}. Please check INSTAGRAM_COOKIES_PATH environment variable.`,
      );
    }

    // Normalize path to forward slashes for cross-platform compatibility
    return ["--cookies", config.instagramCookies.replace(/\\/g, "/")];
  }

  /**
   * Download Instagram media using gallery-dl
   */
  async download(): Promise<string> {
    const shortcode = this.data?.shortcode || this.data?.id || "instagram";
    this.folderName = await createDownloadFolder(shortcode);

    try {
      await spawnProcessOrThrow({
        command: config.galleryDl,
        args: [
          this.url,
          "--destination",
          getDownloadFolderPath(this.folderName),
          "--directory",
          "",
          "--no-part",
          ...(await this.getCookiesArgs()),
        ],
        ignoreStdout: true,
      });
    } catch (error) {
      await this.cleanupFolder();
      throw error;
    }

    return this.folderName;
  }

  /**
   * Extract the audio track from the video without re-encoding
   * (Instagram uses AAC, which goes into .m4a as is)
   */
  async extractAudio(videoPath: string): Promise<string> {
    const audioPath = videoPath.replace(/\.[^/.]+$/, ".m4a");

    await spawnProcessOrThrow({
      command: config.ffmpeg,
      args: ["-i", videoPath, "-vn", "-c:a", "copy", "-y", audioPath],
      ignoreStdout: true,
    });

    return audioPath;
  }

  /**
   * Safely removes the download folder if it exists, never throws
   */
  async cleanupFolder(): Promise<void> {
    await removeDownloadFolder(this.folderName);
  }
}
