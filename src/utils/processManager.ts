import { spawn } from "child_process";
import { config } from "@/config/config";

export const INFO_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes
export const DOWNLOAD_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const MAX_BUFFER_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * Limits how many external processes (yt-dlp, gallery-dl, ffmpeg) run at once
 */
class Semaphore {
  private active = 0;
  private waiting: Array<() => void> = [];

  constructor(private readonly limit: number) {}

  async acquire(): Promise<() => void> {
    if (this.active >= this.limit) {
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    }
    this.active++;

    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active--;
      this.waiting.shift()?.();
    };
  }
}

const processSemaphore = new Semaphore(config.maxConcurrentProcesses);

export interface ProcessOptions {
  command: string;
  args: string[];
  timeout?: number;
  maxBufferSize?: number;
  // Discard stdout (download progress) instead of buffering it
  ignoreStdout?: boolean;
}

export interface ProcessResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

/**
 * Spawn a process with a concurrency limit, timeout and buffer size limits.
 * Resolves with the result for any exit code; rejects on spawn errors,
 * timeout and buffer overflow.
 */
export async function spawnProcess(
  options: ProcessOptions,
): Promise<ProcessResult> {
  const {
    command,
    args,
    timeout = DOWNLOAD_TIMEOUT_MS,
    maxBufferSize = MAX_BUFFER_SIZE,
    ignoreStdout = false,
  } = options;

  const release = await processSemaphore.acquire();

  try {
    return await new Promise<ProcessResult>((resolve, reject) => {
      let stdout = "";
      let stderr = "";
      let settled = false;

      const childProcess = spawn(command, args, {
        shell: false, // Explicitly disable shell for security
        stdio: ["ignore", ignoreStdout ? "ignore" : "pipe", "pipe"],
      });

      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutHandle);
        childProcess.kill("SIGTERM");
        reject(error);
      };

      const timeoutHandle = setTimeout(() => {
        fail(
          new Error(
            `${command} timed out after ${Math.round(timeout / 1000)} seconds`,
          ),
        );
      }, timeout);

      childProcess.stdout?.on("data", (data: Buffer) => {
        if (stdout.length + data.length > maxBufferSize) {
          fail(new Error(`${command} output buffer exceeded maximum size`));
          return;
        }
        stdout += data.toString();
      });

      childProcess.stderr?.on("data", (data: Buffer) => {
        // Keep only the tail of stderr, it holds the actual error
        stderr = (stderr + data.toString()).slice(-maxBufferSize);
      });

      childProcess.on("error", (error) => {
        fail(new Error(`Spawning ${command} failed: ${error.message}`));
      });

      childProcess.on("close", (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutHandle);
        resolve({ stdout, stderr, code });
      });
    });
  } finally {
    release();
  }
}

/**
 * Spawn a process and throw if it exits with a non-zero code
 */
export async function spawnProcessOrThrow(
  options: ProcessOptions,
): Promise<ProcessResult> {
  const result = await spawnProcess(options);

  if (result.code !== 0) {
    throw new Error(
      `${options.command} exited with code ${result.code}: ${result.stderr.slice(-2000)}`,
    );
  }

  return result;
}

/**
 * Spawn a process and parse JSON output
 */
export async function spawnProcessJson<T>(options: ProcessOptions): Promise<T> {
  const result = await spawnProcessOrThrow({
    timeout: INFO_TIMEOUT_MS,
    ...options,
  });

  try {
    return JSON.parse(result.stdout) as T;
  } catch (error) {
    throw new Error(
      `Failed to parse ${options.command} JSON output: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}
