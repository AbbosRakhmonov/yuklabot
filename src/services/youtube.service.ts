import { config } from "@/config/config";
import { IYoutubeData } from "@/interfaces/IYoutubeData";
import { YOUTUBE_GET_INFO_ARGS } from "@/scenes/youtube/constants";
import { spawn } from "child_process";

export class YoutubeService {
  url: string;
  data: IYoutubeData | null = null;
  videoFormat: string | null = null;

  constructor(url: string) {
    this.url = url;
  }

  getVideoInfo(): Promise<IYoutubeData> {
    return new Promise((resolve, reject) => {
      const args = [this.url, ...YOUTUBE_GET_INFO_ARGS];

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
                `Failed to parse ytdlp output as JSON: ${
                  error instanceof Error ? error.message : String(error)
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

  // getVideoFormats(): string[] {
  //   return this.data?.formats.filter(
  //     (f) => f.vcodec !== "none" && f.acodec !== "none"
  //   );
  // }

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
