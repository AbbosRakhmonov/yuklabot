import { config } from "@/config/config";
import { MAX_FILE_SIZE } from "@/constants";
import { sanitizeUrl } from "@/helpers/sanitizeUrl";
import { IYoutubeData, IYoutubeFormat } from "@/interfaces/IYoutubeData";
import { YOUTUBE_GET_INFO_ARGS } from "@/scenes/youtube/constants";
import {
  createDownloadFolder,
  getDownloadFolderPath,
  removeDownloadFolder,
} from "@/utils/downloadFolder";
import {
  spawnProcessJson,
  spawnProcessOrThrow,
} from "@/utils/processManager";

export class YoutubeService {
  url: string;
  data: IYoutubeData | null = null;
  formatId: string | null = null;
  folderName: string | null = null;

  constructor(url: string) {
    this.url = sanitizeUrl(url);
  }

  async getInfo(matchFilters: string[] = []): Promise<IYoutubeData> {
    this.data = await spawnProcessJson<IYoutubeData>({
      command: config.ytdlp,
      args: [this.url, ...YOUTUBE_GET_INFO_ARGS, ...matchFilters],
    });
    return this.data;
  }

  getVideoFormats(): IYoutubeFormat[] {
    const filtered =
      this.data?.formats?.filter((f) => {
        if (f.vcodec === "none" || !f.height || f.height < 144) {
          return false;
        }
        // DASH video-only formatlarida aniq `filesize` ko'pincha bo'lmaydi,
        // faqat `filesize_approx` keladi. Avval shuni ishlatamiz; hajmi
        // umuman noma'lum bo'lsa ham (yuqori sifatlarda shunday bo'ladi)
        // formatni tashlab yubormaymiz, aks holda sifat menyusi kambag'al bo'ladi.
        const size = f.filesize ?? f.filesize_approx;
        return size == null || size <= MAX_FILE_SIZE;
      }) ?? [];

    const seenFormatNotes = new Set<string>();
    return filtered.filter((f) => {
      const formatNote = f.format_note;
      if (!formatNote || seenFormatNotes.has(formatNote)) {
        return false;
      }
      seenFormatNotes.add(formatNote);
      return true;
    });
  }

  async downloadVideo(height: string): Promise<string> {
    // height comes from callback data, which a client can forge
    if (!/^\d{2,4}$/.test(height)) {
      throw new Error(`Invalid video height: ${height}`);
    }
    this.formatId = height;

    return this.download(["-f", `bv[height=${height}]+ba`, "-t", "mp4"]);
  }

  async downloadAudio(): Promise<string> {
    return this.download([
      "--embed-metadata",
      "--embed-thumbnail",
      "-f",
      "ba",
      "-t",
      "mp3",
    ]);
  }

  private async download(formatArgs: string[]): Promise<string> {
    this.folderName = await createDownloadFolder(this.data?.id || "youtube");

    try {
      await spawnProcessOrThrow({
        command: config.ytdlp,
        args: [
          this.url,
          ...YOUTUBE_GET_INFO_ARGS,
          ...formatArgs,
          "-P",
          getDownloadFolderPath(this.folderName),
          "-o",
          `%(title).150B.%(ext)s`,
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
