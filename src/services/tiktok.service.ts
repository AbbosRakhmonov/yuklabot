import { config } from "@/config/config";
import { MAX_FILE_SIZE } from "@/constants";
import { sanitizeUrl } from "@/helpers/sanitizeUrl";
import { ITiktokData } from "@/interfaces/ITiktokData";
import {
  TIKTOK_GET_INFO_ARGS,
  TIKTOK_DOWNLOAD_ARGS,
} from "@/scenes/tiktok/constants";
import { myDayjs } from "@/utils/myDayjs";
import { spawn } from "child_process";
import fs from "fs/promises";
import path from "path";
import logger from "@/config/logger";

const PROCESS_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const MAX_BUFFER_SIZE = 10 * 1024 * 1024; // 10MB

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

  getInfo(): Promise<ITiktokData> {
    return new Promise((resolve, reject) => {
      const args = [
        this.url,
        ...TIKTOK_GET_INFO_ARGS,
        ...this.getProxyArgs(),
        ...this.getNoWatermarkArgs(),
      ];

      const childProcess = spawn(config.ytdlp, args, {
        shell: false,
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
            this.data = JSON.parse(stdout) as ITiktokData;
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

  /**
   * Check if the video file size is within Telegram limits
   */
  isFileSizeValid(): boolean {
    const filesize = this.data?.filesize || this.data?.filesize_approx || 0;
    return filesize <= MAX_FILE_SIZE;
  }

  async downloadVideo(): Promise<string> {
    const downloadDir = config.downloadDir;

    // Check if directory exists, create if not
    try {
      await fs.access(downloadDir);
    } catch {
      await fs.mkdir(downloadDir, { recursive: true });
    }

    const timeStamp = myDayjs().format("YYYY-MM-DD_HH-mm-ss");
    this.folderName = `${timeStamp}_${this.data?.id || "tiktok"}`;

    await fs.mkdir(path.join(downloadDir, this.folderName), {
      recursive: true,
    });
    const downloadPath = path.join(downloadDir, this.folderName);

    const args = [
      this.url,
      ...TIKTOK_DOWNLOAD_ARGS,
      ...this.getProxyArgs(),
      ...this.getNoWatermarkArgs(),
      "-f",
      "best[ext=mp4]/best", // Best quality MP4 format
      "-P",
      downloadPath,
      "-o",
      `%(title).100s.%(ext)s`, // Limit title length for filesystem compatibility
    ];

    const childProcess = spawn(config.ytdlp, args, {
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    });

    return new Promise((resolve, reject) => {
      let stderr: string = "";
      let timeoutCleared = false;

      // Set timeout
      const timeout = setTimeout(() => {
        if (!timeoutCleared) {
          childProcess.kill("SIGTERM");
          this.removeFolderIfExists(downloadDir, this.folderName!).catch(
            () => {}
          );
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
          this.removeFolderIfExists(downloadDir, this.folderName!).catch(
            () => {}
          );
          reject(new Error("Error buffer exceeded maximum size"));
          return;
        }
        stderr += data.toString();
      });

      childProcess.on("error", async (error) => {
        clearTimeoutHandle();
        await this.removeFolderIfExists(downloadDir, this.folderName!);
        reject(new Error(`Spawning ytdlp process failed: ${error.message}`));
      });

      childProcess.on("close", async (code) => {
        clearTimeoutHandle();
        if (code === 0) {
          resolve(this.folderName!);
        } else {
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
    this.folderName = `${timeStamp}_${this.data?.id || "tiktok"}_audio`;

    await fs.mkdir(path.join(downloadDir, this.folderName), {
      recursive: true,
    });
    const downloadPath = path.join(downloadDir, this.folderName);

    const args = [
      this.url,
      ...TIKTOK_DOWNLOAD_ARGS,
      ...this.getProxyArgs(),
      ...this.getNoWatermarkArgs(),
      "--embed-metadata",
      "-f",
      "ba/best", // Best audio format
      "-x", // Extract audio
      "--audio-format",
      "mp3",
      "-P",
      downloadPath,
      "-o",
      `%(title).100s.%(ext)s`,
    ];

    const childProcess = spawn(config.ytdlp, args, {
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    });

    return new Promise((resolve, reject) => {
      let stderr: string = "";
      let timeoutCleared = false;

      // Set timeout
      const timeout = setTimeout(() => {
        if (!timeoutCleared) {
          childProcess.kill("SIGTERM");
          this.removeFolderIfExists(downloadDir, this.folderName!).catch(
            () => {}
          );
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
          this.removeFolderIfExists(downloadDir, this.folderName!).catch(
            () => {}
          );
          reject(new Error("Error buffer exceeded maximum size"));
          return;
        }
        stderr += data.toString();
      });

      childProcess.on("error", async (error) => {
        clearTimeoutHandle();
        await this.removeFolderIfExists(downloadDir, this.folderName!);
        reject(new Error(`Spawning ytdlp process failed: ${error.message}`));
      });

      childProcess.on("close", async (code) => {
        clearTimeoutHandle();
        if (code === 0) {
          resolve(this.folderName!);
        } else {
          await this.removeFolderIfExists(downloadDir, this.folderName!);
          reject(
            new Error(`ytdlp process exited with code ${code}: ${stderr}`)
          );
        }
      });
    });
  }

  /**
   * Helper method to remove folder if it exists
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
      logger.error("Failed to cleanup folder", {
        folderPath,
        error: cleanupError,
      });
    }
  }
}
