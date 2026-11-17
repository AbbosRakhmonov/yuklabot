import { ChildProcess, spawn } from "child_process";
import { config } from "@/config/config";
import { MESSAGES } from "@/constants";
import { UserError } from "@/utils/errors";

export const INFO_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes
export const DOWNLOAD_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const MAX_BUFFER_SIZE = 10 * 1024 * 1024; // 10MB
// How long to wait for a killed process to exit (so its files get unlocked)
const KILL_WAIT_MS = 5000;

const IS_WINDOWS = process.platform === "win32";

/**
 * Thrown when a process is stopped through its AbortSignal (user pressed ❌)
 */
export class ProcessCancelledError extends UserError {
  constructor() {
    super(MESSAGES.INFO.DOWNLOAD_CANCELLED);
    this.name = "ProcessCancelledError";
  }
}

/**
 * Limits how many external processes run at once
 */
class Semaphore {
  private active = 0;
  private waiting: Array<() => void> = [];

  constructor(private readonly limit: number) {}

  async acquire(signal?: AbortSignal): Promise<() => void> {
    if (this.active >= this.limit) {
      await new Promise<void>((resolve, reject) => {
        const onAbort = () => {
          this.waiting = this.waiting.filter((w) => w !== wake);
          reject(new ProcessCancelledError());
        };
        const wake = () => {
          signal?.removeEventListener("abort", onAbort);
          resolve();
        };
        this.waiting.push(wake);
        signal?.addEventListener("abort", onAbort, { once: true });
      });
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

/**
 * - info: quick metadata lookups (yt-dlp -j, gallery-dl --dump-json)
 * - download: long downloads and conversions
 * Separate limits, so a quick lookup never waits behind long downloads
 */
export type ProcessKind = "info" | "download";

const semaphores: Record<ProcessKind, Semaphore> = {
  info: new Semaphore(config.maxConcurrentInfoProcesses),
  download: new Semaphore(config.maxConcurrentProcesses),
};

/**
 * Kills the process together with its children (yt-dlp runs ffmpeg)
 */
const killTree = (child: ChildProcess): void => {
  if (child.pid === undefined || child.exitCode !== null) return;

  if (IS_WINDOWS) {
    spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    }).on("error", () => child.kill());
    return;
  }

  try {
    // Negative pid: the whole process group (spawned with detached: true)
    process.kill(-child.pid, "SIGTERM");
  } catch {
    child.kill("SIGTERM");
  }
};

// Running child processes, so a shutdown can stop them
const activeChildren = new Set<ChildProcess>();

/**
 * Kills every running yt-dlp/gallery-dl/ffmpeg process.
 * Called on shutdown: processes run in their own process group (Linux), so
 * they would otherwise outlive the bot on `pm2 restart` / deploy.
 */
export const killAllProcesses = (): void => {
  for (const child of activeChildren) killTree(child);
  activeChildren.clear();
};

export interface ProcessOptions {
  command: string;
  args: string[];
  kind?: ProcessKind; // default: "download"
  timeout?: number;
  maxBufferSize?: number;
  // Discard stdout (download progress) instead of buffering it
  ignoreStdout?: boolean;
  // Called for every stdout line; return true to keep the line out of
  // the buffered stdout (e.g. progress lines)
  onStdoutLine?: (line: string) => boolean;
  // Aborting kills the process and rejects with ProcessCancelledError
  signal?: AbortSignal;
}

export interface ProcessResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

/**
 * Spawn a process with a concurrency limit, timeout and buffer size limits.
 * Resolves with the result for any exit code; rejects on spawn errors,
 * timeout, buffer overflow and cancellation.
 */
export async function spawnProcess(
  options: ProcessOptions,
): Promise<ProcessResult> {
  const {
    command,
    args,
    kind = "download",
    timeout = DOWNLOAD_TIMEOUT_MS,
    maxBufferSize = MAX_BUFFER_SIZE,
    ignoreStdout = false,
    onStdoutLine,
    signal,
  } = options;

  if (signal?.aborted) throw new ProcessCancelledError();
  const release = await semaphores[kind].acquire(signal);

  try {
    if (signal?.aborted) throw new ProcessCancelledError();

    return await new Promise<ProcessResult>((resolve, reject) => {
      let stdout = "";
      let stderr = "";
      let failure: Error | null = null;
      let done = false;
      let killWaitHandle: NodeJS.Timeout | undefined;

      const pipeStdout = !ignoreStdout || onStdoutLine !== undefined;
      const childProcess = spawn(command, args, {
        shell: false, // Explicitly disable shell for security
        stdio: ["ignore", pipeStdout ? "pipe" : "ignore", "pipe"],
        windowsHide: true,
        // Own process group on Linux/macOS, so killTree reaches ffmpeg too
        detached: !IS_WINDOWS,
      });
      activeChildren.add(childProcess);
      // Decode as UTF-8 stream so multi-byte chars split across chunks survive
      childProcess.stdout?.setEncoding("utf8");
      childProcess.stderr?.setEncoding("utf8");

      const finish = (settle: () => void) => {
        if (done) return;
        done = true;
        activeChildren.delete(childProcess);
        clearTimeout(timeoutHandle);
        clearTimeout(killWaitHandle);
        signal?.removeEventListener("abort", onAbort);
        settle();
      };

      // Kill the process, then reject once it has exited
      const fail = (error: Error) => {
        if (failure || done) return;
        failure = error;
        killTree(childProcess);
        killWaitHandle = setTimeout(
          () => finish(() => reject(error)),
          KILL_WAIT_MS,
        );
      };

      const onAbort = () => fail(new ProcessCancelledError());
      signal?.addEventListener("abort", onAbort, { once: true });

      const timeoutHandle = setTimeout(() => {
        fail(
          new Error(
            `${command} timed out after ${Math.round(timeout / 1000)} seconds`,
          ),
        );
      }, timeout);

      const appendStdout = (text: string) => {
        if (ignoreStdout || failure) return;
        if (stdout.length + text.length > maxBufferSize) {
          fail(new Error(`${command} output buffer exceeded maximum size`));
          return;
        }
        stdout += text;
      };

      // Returns true if the line was consumed by onStdoutLine
      const consumeLine = (line: string): boolean => {
        try {
          return onStdoutLine?.(line.replace(/\r$/, "")) ?? false;
        } catch {
          // A broken listener must never kill the download
          return false;
        }
      };

      let pendingLine = "";
      childProcess.stdout?.on("data", (data: string) => {
        if (!onStdoutLine) {
          appendStdout(data);
          return;
        }

        const lines = (pendingLine + data).split("\n");
        pendingLine = lines.pop() ?? "";
        for (const line of lines) {
          if (!consumeLine(line)) appendStdout(`${line}\n`);
        }
      });

      childProcess.stderr?.on("data", (data: string) => {
        // Keep only the tail of stderr, it holds the actual error
        stderr = (stderr + data).slice(-maxBufferSize);
      });

      childProcess.on("error", (error) => {
        finish(() =>
          reject(new Error(`Spawning ${command} failed: ${error.message}`)),
        );
      });

      childProcess.on("close", (code) => {
        if (pendingLine && !consumeLine(pendingLine)) appendStdout(pendingLine);
        finish(() =>
          failure ? reject(failure) : resolve({ stdout, stderr, code }),
        );
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
 * Spawn a quick metadata process and parse its JSON output
 */
export async function spawnProcessJson<T>(options: ProcessOptions): Promise<T> {
  const result = await spawnProcessOrThrow({
    kind: "info",
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
      { cause: error },
    );
  }
}
