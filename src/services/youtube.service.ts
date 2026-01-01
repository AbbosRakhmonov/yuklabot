import { config } from "@/config/config";
import { MAX_FILE_SIZE } from "@/constants";
import { sanitizeUrl } from "@/helpers/sanitizeUrl";
import { IYoutubeData, IYoutubeFormat } from "@/interfaces/IYoutubeData";
import { YOUTUBE_GET_INFO_ARGS } from "@/scenes/youtube/constants";
import { myDayjs } from "@/utils/myDayjs";
import { spawn } from "child_process";
import fs from "fs/promises";
import path from "path";
import logger from "@/config/logger";

const PROCESS_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const MAX_BUFFER_SIZE = 10 * 1024 * 1024; // 10MB

export class YoutubeService {
  url: string;
  data: IYoutubeData | null = null;
  formatId: string | null = null;
  folderName: string | null = null;

  constructor(url: string) {
    this.url = sanitizeUrl(url);
  }

  getInfo(matchFilters: string[] = []): Promise<IYoutubeData> {
    return new Promise((resolve, reject) => {
      const args = [this.url, ...YOUTUBE_GET_INFO_ARGS, ...matchFilters];

      const childProcess = spawn(config.ytdlp, args, {
        shell: false, // Explicitly disable shell
        stdio: ["pipe", "pipe", "pipe"],
      });

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

  getVideoFormats(): IYoutubeFormat[] {
    const filtered =
      this.data?.formats?.filter(
        (f) =>
          f.vcodec !== "none" &&
          f.height &&
          f.height >= 144 &&
          f.filesize &&
          f.filesize <= MAX_FILE_SIZE
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

  async downloadVideo(height: string): Promise<string> {
    this.formatId = height;
    const downloadDir = config.downloadDir;

    // Check if directory exists, create if not
    try {
      await fs.access(downloadDir);
    } catch {
      await fs.mkdir(downloadDir, { recursive: true });
    }

    const timeStamp = myDayjs().format("YYYY-MM-DD_HH-mm-ss");
    this.folderName = `${timeStamp}_${this.data?.id}`;

    await fs.mkdir(path.join(downloadDir, this.folderName), {
      recursive: true,
    });
    const downloadPath = path.join(downloadDir, this.folderName);

    const args = [
      this.url,
      ...YOUTUBE_GET_INFO_ARGS,
      "-f",
      `bv[height=${height}]+ba`,
      "-t",
      "mp4",
      "-P",
      downloadPath,
      "-o",
      `%(title)s.%(ext)s`,
    ];

    const childProcess = spawn(config.ytdlp, args, {
      shell: false, // Explicitly disable shell
      stdio: ["pipe", "pipe", "pipe"],
    });

    return new Promise((resolve, reject) => {
      let stderr: string = "";
      let timeoutCleared = false;

      // Set timeout
      const timeout = setTimeout(() => {
        if (!timeoutCleared) {
          childProcess.kill("SIGTERM");
          this.removeFolderIfExists(downloadDir, this.folderName!).catch(() => {
            // Ignore cleanup errors
          });
          reject(new Error("Process timeout after 5 minutes"));
        }
      }, PROCESS_TIMEOUT_MS);

      const clearTimeoutHandle = () => {
        if (!timeoutCleared) {
          timeoutCleared = true;
          clearTimeout(timeout);
        }
      };

      childProcess.stderr.on("data", (data: Buffer) => {
        if (stderr.length + data.length > MAX_BUFFER_SIZE) {
          clearTimeoutHandle();
          childProcess.kill("SIGTERM");
          this.removeFolderIfExists(downloadDir, this.folderName!).catch(() => {
            // Ignore cleanup errors
          });
          reject(new Error("Error buffer exceeded maximum size"));
          return;
        }
        stderr += data.toString();
      });

      childProcess.on("error", async (error) => {
        clearTimeoutHandle();
        // remove the folder
        await this.removeFolderIfExists(downloadDir, this.folderName!);
        reject(new Error(`Spawning ytdlp process failed: ${error.message}`));
      });

      childProcess.on("close", async (code) => {
        clearTimeoutHandle();
        if (code === 0) {
          resolve(this.folderName!);
        } else {
          // remove the folder
          await this.removeFolderIfExists(downloadDir, this.folderName!);
          reject(
            new Error(`ytdlp process exited with code ${code}: ${stderr}`)
          );
        }
      });
    });
  }

  async downloadAudio(): Promise<string> {
    const downloadDir = config.downloadDir;

    // Check if directory exists, create if not
    try {
      await fs.access(downloadDir);
    } catch {
      await fs.mkdir(downloadDir, { recursive: true });
    }

    const timeStamp = myDayjs().format("YYYY-MM-DD_HH-mm-ss");
    this.folderName = `${timeStamp}_${this.data?.id}`;
    await fs.mkdir(path.join(downloadDir, this.folderName), {
      recursive: true,
    });
    const downloadPath = path.join(downloadDir, this.folderName);
    const args = [
      this.url,
      ...YOUTUBE_GET_INFO_ARGS,
      "--embed-metadata",
      "--embed-thumbnail",
      "-f",
      "ba",
      "-t",
      "mp3",
      "-P",
      downloadPath,
      "-o",
      `%(title)s.%(ext)s`,
    ];
    const childProcess = spawn(config.ytdlp, args, {
      shell: false, // Explicitly disable shell
      stdio: ["pipe", "pipe", "pipe"],
    });
    return new Promise((resolve, reject) => {
      let stderr: string = "";
      let timeoutCleared = false;

      // Set timeout
      const timeout = setTimeout(() => {
        if (!timeoutCleared) {
          childProcess.kill("SIGTERM");
          this.removeFolderIfExists(downloadDir, this.folderName!).catch(() => {
            // Ignore cleanup errors
          });
          reject(new Error("Process timeout after 5 minutes"));
        }
      }, PROCESS_TIMEOUT_MS);

      const clearTimeoutHandle = () => {
        if (!timeoutCleared) {
          timeoutCleared = true;
          clearTimeout(timeout);
        }
      };

      childProcess.stderr.on("data", (data: Buffer) => {
        if (stderr.length + data.length > MAX_BUFFER_SIZE) {
          clearTimeoutHandle();
          childProcess.kill("SIGTERM");
          this.removeFolderIfExists(downloadDir, this.folderName!).catch(() => {
            // Ignore cleanup errors
          });
          reject(new Error("Error buffer exceeded maximum size"));
          return;
        }
        stderr += data.toString();
      });
      childProcess.on("error", async (error) => {
        clearTimeoutHandle();
        // remove the folder
        await this.removeFolderIfExists(downloadDir, this.folderName!);
        reject(new Error(`Spawning ytdlp process failed: ${error.message}`));
      });
      childProcess.on("close", async (code) => {
        clearTimeoutHandle();
        if (code === 0) {
          resolve(this.folderName!);
        } else {
          // remove the folder
          await this.removeFolderIfExists(downloadDir, this.folderName!);
          reject(
            new Error(`ytdlp process exited with code ${code}: ${stderr}`)
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
   * Safely removes a download folder if it exists.
   * This method handles errors gracefully and logs them without throwing.
   * Uses the folderName stored in the service instance.
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
      // Log cleanup error but don't throw - we've already handled the main error
      logger.error("Failed to cleanup folder", {
        folderPath,
        error: cleanupError,
      });
    }
  }
}
