import fs from "fs/promises";
import path from "path";
import { config } from "@/config/config";
import { sanitizeUrl } from "@/helpers/sanitizeUrl";
import { ITiktokData } from "@/interfaces/ITiktokData";
import { TIKTOK_BASE_ARGS } from "@/scenes/tiktok/constants";
import {
  createDownloadFolder,
  getDownloadFolderPath,
  removeDownloadFolder,
} from "@/utils/downloadFolder";
import { spawnProcessOrThrow } from "@/utils/processManager";
import { ProxyEntry, proxyArgs, tiktokProxyEntry, withProxyRotation } from "@/utils/proxy";
import {
  getYtdlpProgressOptions,
  ProgressCallback,
} from "@/utils/ytdlpProgress";

const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];
const PHOTO_AUDIO_EXTENSIONS = [".mp3", ".m4a"];

export interface ITiktokDownloadOptions {
  onProgress?: ProgressCallback;
  signal?: AbortSignal;
}

export interface ITiktokPhotoPost {
  images: string[]; // file paths, in post order
  audio?: string; // background music, file path
  description?: string;
  author?: string;
  musicTitle?: string;
}

// The part of gallery-dl's info.json we use
interface IGalleryDlTiktokInfo {
  desc?: string;
  author?: { uniqueId?: string; nickname?: string };
  music?: { title?: string; authorName?: string };
}

export class TiktokService {
  url: string;
  data: ITiktokData | null = null;
  folderName: string | null = null;

  constructor(url: string) {
    this.url = sanitizeUrl(url);
  }

  /**
   * Photo posts (slideshows) live under /photo/, yt-dlp can't download them
   */
  isPhotoPost(): boolean {
    return /\/photo\/\d+/.test(new URL(this.url).pathname);
  }

  /**
   * Get extractor arguments for downloading without watermark
   * Uses api_hostname to get watermark-free version
   */
  private getNoWatermarkArgs(): string[] {
    return [
      "--extractor-args",
      "tiktok:api_hostname=api16-normal-c-useast1a.tiktokv.com",
    ];
  }

  /**
   * Get common args for all yt-dlp calls
   */
  private getCommonArgs(proxy: ProxyEntry | null): string[] {
    return [...TIKTOK_BASE_ARGS, ...proxyArgs(proxy), ...this.getNoWatermarkArgs()];
  }

  /**
   * Empties the download folder between proxy attempts, so a half-written
   * file of a failed attempt can't be picked up
   */
  private async resetFolder(): Promise<string> {
    const folderPath = getDownloadFolderPath(this.folderName as string);
    await fs.rm(folderPath, { recursive: true, force: true });
    await fs.mkdir(folderPath, { recursive: true });
    return folderPath;
  }

  async downloadVideo(options: ITiktokDownloadOptions = {}): Promise<string> {
    return this.download(
      "tiktok",
      [
        "-f",
        "b[ext=mp4]/b",
        // Prefer H.264: some Telegram clients can't play H.265 (bytevc1)
        "-S",
        "vcodec:h264",
      ],
      options,
    );
  }

  async downloadAudio(options: ITiktokDownloadOptions = {}): Promise<string> {
    return this.download(
      "tiktok_audio",
      [
        "--embed-metadata",
        "-f",
        "ba/b",
        // Extract the audio as is (mp3 stays mp3, AAC goes into .m4a),
        // never re-encoded
        "-x",
      ],
      options,
    );
  }

  /**
   * Downloads the images and music of a photo post with gallery-dl
   */
  async downloadPhotos(
    options: Pick<ITiktokDownloadOptions, "signal"> = {},
  ): Promise<ITiktokPhotoPost> {
    this.folderName = await createDownloadFolder("tiktok_photo");
    const folderPath = getDownloadFolderPath(this.folderName);

    try {
      await withProxyRotation(
        "TikTok photo",
        async (proxy) =>
          spawnProcessOrThrow({
            command: config.galleryDl,
            args: [
              this.url,
              ...proxyArgs(proxy),
              "--destination",
              await this.resetFolder(),
              "--directory",
              "",
              "--no-part",
              // Short names (Windows path limit); "_01", "_02"... keep the order
              "-f",
              "{id}{num:?_//>02}.{extension}",
              "--write-info-json",
            ],
            ignoreStdout: true,
            signal: options.signal,
          }),
        { signal: options.signal, extraProxies: [tiktokProxyEntry] },
      );

      const files = (await fs.readdir(folderPath)).sort();
      const byExtension = (extensions: string[]) =>
        files
          .filter((f) => extensions.includes(path.extname(f).toLowerCase()))
          .map((f) => path.join(folderPath, f));

      const info = await this.readPhotoInfo(folderPath);
      return {
        images: byExtension(IMAGE_EXTENSIONS),
        audio: byExtension(PHOTO_AUDIO_EXTENSIONS)[0],
        description: info?.desc,
        author: info?.author?.nickname || info?.author?.uniqueId,
        musicTitle: info?.music?.title,
      };
    } catch (error) {
      await this.cleanupFolder();
      throw error;
    }
  }

  private async readPhotoInfo(
    folderPath: string,
  ): Promise<IGalleryDlTiktokInfo | null> {
    try {
      const raw = await fs.readFile(path.join(folderPath, "info.json"), "utf8");
      return JSON.parse(raw) as IGalleryDlTiktokInfo;
    } catch {
      return null; // Metadata is optional
    }
  }

  /**
   * Downloads the media and fills `this.data` from the same yt-dlp run,
   * so TikTok is only queried once
   */
  private async download(
    folderSuffix: string,
    formatArgs: string[],
    { onProgress, signal }: ITiktokDownloadOptions,
  ): Promise<string> {
    this.folderName = await createDownloadFolder(folderSuffix);
    const progress = getYtdlpProgressOptions(onProgress);

    try {
      // yt-dlp extracts and downloads in one run, so the (IP-bound) video
      // URL is always fetched through the proxy that got it
      const { result } = await withProxyRotation(
        "TikTok",
        async (proxy) =>
          spawnProcessOrThrow({
            command: config.ytdlp,
            args: [
              this.url,
              ...this.getCommonArgs(proxy),
              ...formatArgs,
              ...progress.args,
              // Print the info JSON to stdout and still download
              "-j",
              "--no-simulate",
              "-P",
              await this.resetFolder(),
              "-o",
              `%(title).100B.%(ext)s`, // Limit title length for filesystem compatibility
            ],
            onStdoutLine: progress.onStdoutLine,
            signal,
          }),
        { signal, extraProxies: [tiktokProxyEntry] },
      );
      this.data = this.parseInfo(result.stdout);
    } catch (error) {
      await this.cleanupFolder();
      throw error;
    }

    return this.folderName;
  }

  /**
   * Parses the info JSON line; metadata is optional, so never throws
   */
  private parseInfo(stdout: string): ITiktokData | null {
    const line = stdout
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.startsWith("{"))
      .pop();

    if (!line) return null;

    try {
      return JSON.parse(line) as ITiktokData;
    } catch {
      return null;
    }
  }

  /**
   * Safely removes the download folder if it exists, never throws
   */
  async cleanupFolder(): Promise<void> {
    await removeDownloadFolder(this.folderName);
  }
}

/**
 * yt-dlp's error for a short link that turned out to be a photo post
 */
export const isUnsupportedPhotoPostError = (error: unknown): boolean =>
  error instanceof Error &&
  error.message.includes("Unsupported URL") &&
  error.message.includes("/photo/");
