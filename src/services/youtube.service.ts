import { config } from "@/config/config";
import { MAX_FILE_SIZE } from "@/constants";
import { IYoutubeData, IYoutubeFormat } from "@/interfaces/IYoutubeData";
import { YOUTUBE_GET_INFO_ARGS } from "@/scenes/youtube/constants";
import { myDayjs } from "@/utils/myDayjs";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";

export class YoutubeService {
  url: string;
  data: IYoutubeData | null = null;
  formatId: string | null = null;

  constructor(url: string) {
    this.url = url;
  }

  getInfo(
    matchFilters: string[] = []): Promise<IYoutubeData> {
    return new Promise((resolve, reject) => {
      const args = [this.url, ...YOUTUBE_GET_INFO_ARGS, ...matchFilters,];

      const childProcess = spawn(config.ytdlp, args);

      let stdout: string = "";
      let stderr: string = "";

      childProcess.stdout.on("data", (data: Buffer) => {
        stdout += data.toString();
      });
      childProcess.stderr.on("data", (data: Buffer) => {
        stderr += data.toString();
      });

      childProcess.on("error", (error) => {
        reject(new Error(`Spawning ytdlp process failed: ${error.message}`));
      });

      childProcess.on("close", (code) => {
        if (code === 0) {
          try {
            this.data = JSON.parse(stdout) as IYoutubeData;
            resolve(this.data);
          } catch (error: unknown) {
            reject(
              new Error(
                `Failed to parse ytdlp output as JSON: ${error instanceof Error ? error.message : String(error)
                }`
              )
            );
          }
        } else {
          reject(
            new Error(`ytdlp process exited with code ${code}: ${stderr}`)
          );
        }
      });
      return childProcess;
    });
  }

  getVideoFormats(): IYoutubeFormat[] {
    const filtered = this.data?.formats?.filter(
      (f) => f.vcodec !== "none" && f.height && f.height >= 144 &&
        f.filesize && f.filesize <= MAX_FILE_SIZE
    ) ?? [];

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

  downloadVideo(height: string): Promise<string> {
    const downloadDir = config.downloadDir;

    if (!fs.existsSync(downloadDir)) {
      fs.mkdirSync(downloadDir, { recursive: true });
    }

    const downloadArgs = YOUTUBE_GET_INFO_ARGS.filter(arg => arg !== '-t');

    const timeStamp = myDayjs().format("YYYY-MM-DD_HH-mm-ss");
    const folderName = `${timeStamp}_${this.data?.id}`;

    fs.mkdirSync(path.join(downloadDir, folderName), { recursive: true });
    const downloadPath = path.join(downloadDir, folderName);
    
    const args = [
      this.url,
      ...downloadArgs,
      "-f", `bv[height=${height}]+ba`,
      "--merge-output-format", "mp4",
      "-P", downloadPath,
      "-o", `%(title)s.%(ext)s`,
      "--print", "after_move:filepath" // Get filepath after download completes
    ];

    const childProcess = spawn(config.ytdlp, args);

    return new Promise((resolve, reject) => {
      let stderr: string = "";

      childProcess.stderr.on("data", (data: Buffer) => {
        stderr += data.toString();
      });

      childProcess.on("error", (error) => {
        reject(new Error(`Spawning ytdlp process failed: ${error.message}`));
      });

      childProcess.on("close", (code) => {
        if (code === 0) {
          resolve(folderName);
        } else {
          reject(new Error(`ytdlp process exited with code ${code}: ${stderr}`));
        }
      });
    });
  }

  getAudioFormats(): IYoutubeFormat[] {
    return this.data?.formats?.filter(
      (f) => f.vcodec === "none" && f.acodec !== "none"
    ) ?? [];
  }

  // downloadVideo(format: string): Promise<void> {
  //   this.videoFormat = format;
  //   return new Promise((resolve, reject) => {
  //     const args = [
  //       this.url,
  //       "--format",
  //       "bestvideo[ext=mp4]+bestaudio[ext=m4a]/mp4",
  //     ];
  //   });
  // }

  // downloadAudio(): Promise<void> {
  //   return new Promise((resolve, reject) => {
  //     const args = [this.url, "--format", "bestaudio[ext=m4a]/m4a"];
  //   });
  // }
}
