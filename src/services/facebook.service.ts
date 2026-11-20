import fs from "fs/promises";
import { config } from "@/config/config";
import { sanitizeUrl } from "@/helpers/sanitizeUrl";
import {
  createDownloadFolder,
  getDownloadFolderPath,
  removeDownloadFolder,
} from "@/utils/downloadFolder";
import { spawnProcessOrThrow } from "@/utils/processManager";
import { proxyArgs, withProxyRotation } from "@/utils/proxy";
import { getYtdlpProgressOptions, ProgressCallback } from "@/utils/ytdlpProgress";

export interface IFacebookData {
  id?: string;
  title?: string;
  description?: string;
  duration?: number;
  width?: number;
  height?: number;
}

export interface IFacebookDownloadOptions {
  onProgress?: ProgressCallback;
  signal?: AbortSignal;
}

/**
 * Public Facebook videos and reels through yt-dlp, no login.
 * Private posts and stories need cookies and fail with yt-dlp's error.
 */
export class FacebookService {
  url: string;
  data: IFacebookData | null = null;
  folderName: string | null = null;

  constructor(url: string) {
    this.url = sanitizeUrl(url);
  }

  /** Downloads the best video that has sound, prefers H.264 mp4 that every Telegram client plays */
  async downloadVideo({ onProgress, signal }: IFacebookDownloadOptions = {}): Promise<string> {
    this.folderName = await createDownloadFolder("facebook");
    const folderPath = getDownloadFolderPath(this.folderName);
    const progress = getYtdlpProgressOptions(onProgress);

    try {
      const { result } = await withProxyRotation(
        "Facebook",
        async (proxy) => {
          // A failed attempt may leave a half-written file behind
          await fs.rm(folderPath, { recursive: true, force: true });
          await fs.mkdir(folderPath, { recursive: true });
          return spawnProcessOrThrow({
            command: config.ytdlp,
            args: [
              this.url,
              "--no-playlist",
              ...proxyArgs(proxy),
              "-f", "bv*+ba/b",
              "-S", "vcodec:h264,res:1080,ext:mp4:m4a",
              "--merge-output-format", "mp4",
              ...progress.args,
              "-j", "--no-simulate",
              "-P", folderPath,
              "-o", "%(id)s.%(ext)s",
            ],
            onStdoutLine: progress.onStdoutLine,
            signal,
          });
        },
        { signal },
      );
      this.data = parseInfo(result.stdout);
    } catch (error) {
      await this.cleanupFolder();
      throw error;
    }
    return this.folderName;
  }

  async cleanupFolder(): Promise<void> {
    await removeDownloadFolder(this.folderName);
  }
}

function parseInfo(stdout: string): IFacebookData | null {
  const line = stdout.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("{")).pop();
  if (!line) return null;
  try {
    return JSON.parse(line) as IFacebookData;
  } catch {
    return null;
  }
}
