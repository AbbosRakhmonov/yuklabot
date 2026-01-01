import { spawn, ChildProcess } from "child_process";

const PROCESS_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const MAX_BUFFER_SIZE = 10 * 1024 * 1024; // 10MB

export interface ProcessOptions {
  command: string;
  args: string[];
  timeout?: number;
  maxBufferSize?: number;
  onStdout?: (data: string) => void;
  onStderr?: (data: string) => void;
}

export interface ProcessResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

/**
 * Spawn a process with timeout and buffer size limits
 * @param options - Process options
 * @returns Promise that resolves with process result
 */
export function spawnProcess(options: ProcessOptions): Promise<ProcessResult> {
  const {
    command,
    args,
    timeout = PROCESS_TIMEOUT_MS,
    maxBufferSize = MAX_BUFFER_SIZE,
    onStdout,
    onStderr,
  } = options;

  return new Promise((resolve, reject) => {
    let stdout: string = "";
    let stderr: string = "";
    let timeoutCleared = false;

    const childProcess = spawn(command, args, {
      shell: false, // Explicitly disable shell for security
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Set timeout
    const timeoutHandle = setTimeout(() => {
      if (!timeoutCleared) {
        childProcess.kill("SIGTERM");
        reject(new Error(`Process timeout after ${timeout / 1000} seconds`));
      }
    }, timeout);

    const clearTimeoutHandle = () => {
      if (!timeoutCleared) {
        timeoutCleared = true;
        clearTimeout(timeoutHandle);
      }
    };

    // Handle stdout
    childProcess.stdout.on("data", (data: Buffer) => {
      if (stdout.length + data.length > maxBufferSize) {
        clearTimeoutHandle();
        childProcess.kill("SIGTERM");
        reject(new Error("Output buffer exceeded maximum size"));
        return;
      }
      const dataStr = data.toString();
      stdout += dataStr;
      if (onStdout) {
        onStdout(dataStr);
      }
    });

    // Handle stderr
    childProcess.stderr.on("data", (data: Buffer) => {
      if (stderr.length + data.length > maxBufferSize) {
        clearTimeoutHandle();
        childProcess.kill("SIGTERM");
        reject(new Error("Error buffer exceeded maximum size"));
        return;
      }
      const dataStr = data.toString();
      stderr += dataStr;
      if (onStderr) {
        onStderr(dataStr);
      }
    });

    // Handle process errors
    childProcess.on("error", (error) => {
      clearTimeoutHandle();
      reject(new Error(`Spawning process failed: ${error.message}`));
    });

    // Handle process close
    childProcess.on("close", (code) => {
      clearTimeoutHandle();
      resolve({
        stdout,
        stderr,
        code,
      });
    });
  });
}

/**
 * Spawn a process and parse JSON output
 * @param options - Process options
 * @returns Promise that resolves with parsed JSON
 */
export async function spawnProcessJson<T>(options: ProcessOptions): Promise<T> {
  const result = await spawnProcess(options);

  if (result.code !== 0) {
    throw new Error(
      `Process exited with code ${result.code}: ${result.stderr}`
    );
  }

  try {
    return JSON.parse(result.stdout) as T;
  } catch (error) {
    throw new Error(
      `Failed to parse JSON output: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Spawn a process and return the child process (for cases where you need direct control)
 * @param command - Command to execute
 * @param args - Command arguments
 * @returns Child process instance
 */
export function spawnProcessRaw(command: string, args: string[]): ChildProcess {
  return spawn(command, args, {
    shell: false,
    stdio: ["pipe", "pipe", "pipe"],
  });
}
