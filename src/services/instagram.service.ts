import { config } from "@/config/config";
import {
  IInstagramData,
  IInstagramMediaItem,
} from "@/interfaces/IInstagramData";
import {
  IInstagramGalleryDlData,
  IGalleryDlJsonResponse,
} from "@/interfaces/IGalleryDlData";
import { myDayjs } from "@/utils/myDayjs";
import { spawn } from "child_process";
import fs from "fs/promises";
import path from "path";
import { EMediaType } from "@/enums/EMediaType";

export class InstagramService {
  url: string;
  data: IInstagramData | null = null;
  galleryDlData: IInstagramGalleryDlData | null = null;
  galleryDlRawData: IGalleryDlJsonResponse | null = null;
  folderName: string | null = null;

  constructor(url: string) {
    this.url = url;
  }

  /**
   * Get Instagram post/reel/story information using gallery-dl
   */
  async getInfo(): Promise<IInstagramData> {
    const args = [this.url, "--dump-json"];

    return new Promise((resolve, reject) => {
      if (config.instagramCookies) {
        const normalizedPath = config.instagramCookies.replace(/\\/g, "/");
        args.push("--cookies", normalizedPath);
      } else {
        reject(new Error("No cookies configured"));
        return;
      }

      const childProcess = spawn(config.galleryDl, args);

      let stdout: string = "";
      let stderr: string = "";

      childProcess.stdout.on("data", (data: Buffer) => {
        stdout += data.toString();
      });

      childProcess.stderr.on("data", (data: Buffer) => {
        stderr += data.toString();
      });

      childProcess.on("error", (error) => {
        reject(
          new Error(`Spawning gallery-dl process failed: ${error.message}`)
        );
      });

      childProcess.on("close", async (code) => {
        if (code === 0) {
          try {
            // Parse JSON
            const parsed = JSON.parse(stdout) as IGalleryDlJsonResponse;

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
                "No valid Instagram data found in gallery-dl output"
              );
            }

            // Store structured data
            this.galleryDlData = jsonData;
            this.data = this.parseInstagramData(jsonData);

            resolve(this.data);
          } catch (error: unknown) {
            reject(
              new Error(
                `Failed to parse gallery-dl output: ${
                  error instanceof Error ? error.message : String(error)
                }`
              )
            );
          }
        } else {
          reject(
            new Error(`gallery-dl process exited with code ${code}: ${stderr}`)
          );
        }
      });
    });
  }

  /**
   * Parse gallery-dl JSON output to IInstagramData format
   */
  private parseInstagramData(
    jsonData: IInstagramGalleryDlData
  ): IInstagramData {
    const detectedType = this.detectMediaType(jsonData);

    // For stories, detect if it's video or image based on content
    let mediaType = detectedType;
    let videoUrl: string | undefined = undefined;
    let imageUrl: string | undefined = undefined;
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
    jsonData: IInstagramGalleryDlData
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
   * Download Instagram media using gallery-dl
   */
  async download(): Promise<string> {
    const downloadDir = config.downloadDir;

    // Check if directory exists, create if not
    try {
      await fs.access(downloadDir);
    } catch {
      await fs.mkdir(downloadDir, { recursive: true });
    }

    const timeStamp = myDayjs().format("YYYY-MM-DD_HH-mm-ss");
    const shortcode = this.data?.shortcode || this.data?.id || "unknown";
    this.folderName = `${timeStamp}_${shortcode}`;

    await fs.mkdir(path.join(downloadDir, this.folderName), {
      recursive: true,
    });
    const downloadPath = path.join(downloadDir, this.folderName);

    const args = [
      this.url,
      "--destination",
      downloadPath,
      "--directory",
      "",
      "--no-part",
    ];

    // Add cookies if available
    if (config.instagramCookies) {
      // Verify cookies file exists
      try {
        await fs.access(config.instagramCookies);
      } catch {
        throw new Error(
          `Instagram cookies file not found at: ${config.instagramCookies}. Please check INSTAGRAM_COOKIES_PATH environment variable.`
        );
      }
      // Normalize path to forward slashes for cross-platform compatibility
      const normalizedPath = config.instagramCookies.replace(/\\/g, "/");
      args.push("--cookies", normalizedPath);
    }

    const childProcess = spawn(config.galleryDl, args);

    return new Promise((resolve, reject) => {
      let stderr: string = "";

      childProcess.stderr.on("data", (data: Buffer) => {
        stderr += data.toString();
      });

      childProcess.on("error", async (error) => {
        await this.removeFolderIfExists(downloadDir, this.folderName!);
        reject(
          new Error(`Spawning gallery-dl process failed: ${error.message}`)
        );
      });

      childProcess.on("close", async (code) => {
        if (code === 0) {
          resolve(this.folderName!);
        } else {
          await this.removeFolderIfExists(downloadDir, this.folderName!);
          reject(
            new Error(`gallery-dl process exited with code ${code}: ${stderr}`)
          );
        }
      });
    });
  }

  /**
   * Extract audio from video using ffmpeg
   */
  async extractAudio(videoPath: string): Promise<string> {
    const audioPath = videoPath.replace(/\.[^/.]+$/, ".mp3");

    return new Promise((resolve, reject) => {
      const args = [
        "-i",
        videoPath,
        "-vn",
        "-c:a",
        "libmp3lame",
        "-q:a",
        "0", // VBR eng yuqori sifat
        "-ar",
        "48000", // Yuqori sample rate
        "-y",
        audioPath,
      ];

      const childProcess = spawn(config.ffmpeg, args);

      let stderr: string = "";

      childProcess.stderr.on("data", (data: Buffer) => {
        stderr += data.toString();
      });

      childProcess.on("error", (error) => {
        reject(new Error(`Spawning ffmpeg process failed: ${error.message}`));
      });

      childProcess.on("close", (code) => {
        if (code === 0) {
          resolve(audioPath);
        } else {
          reject(
            new Error(`ffmpeg process exited with code ${code}: ${stderr}`)
          );
        }
      });
    });
  }

  /**
   * Helper method to remove folder if it exists (non-blocking)
   */
  private async removeFolderIfExists(
    downloadDir: string,
    folderName: string
  ): Promise<void> {
    const folderPath = path.join(downloadDir, folderName);
    try {
      await fs.access(folderPath);
      await fs.rm(folderPath, { recursive: true });
    } catch {
      // Folder doesn't exist or already removed, ignore
    }
  }

  /**
   * Safely removes a download folder if it exists
   */
  async cleanupFolder(): Promise<void> {
    if (!this.folderName) {
      return;
    }

    const folderPath = path.join(config.downloadDir, this.folderName);
    try {
      await fs.access(folderPath);
      await fs.rm(folderPath, { recursive: true });
    } catch (cleanupError) {
      console.error(`Failed to cleanup folder ${folderPath}:`, cleanupError);
    }
  }
}
