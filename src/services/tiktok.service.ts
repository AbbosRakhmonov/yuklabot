import { config } from "@/config/config";
import { sanitizeUrl } from "@/helpers/sanitizeUrl";
import { ITiktokData } from "@/interfaces/ITiktokData";
import { TIKTOK_BASE_ARGS } from "@/scenes/tiktok/constants";
import {
  createDownloadFolder,
  getDownloadFolderPath,
  removeDownloadFolder,
} from "@/utils/downloadFolder";
import {
  spawnProcessJson,
  spawnProcessOrThrow,
} from "@/utils/processManager";

export class TiktokService {
  url: string;
  data: ITiktokData | null = null;
  folderName: string | null = null;

  constructor(url: string) {
    this.url = sanitizeUrl(url);
  }

  /**
   * Get proxy arguments for yt-dlp if configured
   */
  private getProxyArgs(): string[] {
    if (config.tiktokProxy) {
      return ["--proxy", config.tiktokProxy];
    }
    return [];
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
  private getCommonArgs(): string[] {
    return [
      ...TIKTOK_BASE_ARGS,
      ...this.getProxyArgs(),
      ...this.getNoWatermarkArgs(),
    ];
  }

  async getInfo(): Promise<ITiktokData> {
    this.data = await spawnProcessJson<ITiktokData>({
      command: config.ytdlp,
      args: [this.url, ...this.getCommonArgs(), "-j"],
    });
    return this.data;
  }

  async downloadVideo(): Promise<string> {
    return this.download(this.data?.id || "tiktok", [
      "-f",
      "best[ext=mp4]/best", // Best quality MP4 format
    ]);
  }

  async downloadAudio(): Promise<string> {
    return this.download(`${this.data?.id || "tiktok"}_audio`, [
      "--embed-metadata",
      "-f",
      "ba/best", // Best audio format
      "-x", // Extract audio
      "--audio-format",
      "mp3",
    ]);
  }

  private async download(
    folderSuffix: string,
    formatArgs: string[],
  ): Promise<string> {
    this.folderName = await createDownloadFolder(folderSuffix);

    try {
      await spawnProcessOrThrow({
        command: config.ytdlp,
        args: [
          this.url,
          ...this.getCommonArgs(),
          ...formatArgs,
          "-P",
          getDownloadFolderPath(this.folderName),
          "-o",
          `%(title).100B.%(ext)s`, // Limit title length for filesystem compatibility
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
   * Safely removes the download folder if it exists, never throws
   */
  async cleanupFolder(): Promise<void> {
    await removeDownloadFolder(this.folderName);
  }
}
