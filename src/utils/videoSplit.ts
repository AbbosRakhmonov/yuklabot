import fs from "fs/promises";
import path from "path";
import { config } from "@/config/config";
import logger from "@/config/logger";
import { MAX_FILE_SIZE, MESSAGES, VIDEO_PART_FILL } from "@/constants";
import { UserError } from "@/utils/errors";
import { spawnProcessOrThrow } from "@/utils/processManager";

// Re-split with more parts at most this many times
const MAX_SPLIT_ATTEMPTS = 4;

export interface IVideoPart {
  path: string;
  size: number;
  duration?: number; // seconds
}

/**
 * How many parts a video of this size needs to fit into Telegram's limit
 */
export const getPartCount = (size: number): number =>
  size <= MAX_FILE_SIZE
    ? 1
    : Math.ceil(size / (MAX_FILE_SIZE * VIDEO_PART_FILL));

/**
 * Duration of a media file in seconds (undefined if ffprobe can't tell)
 */
export const probeDuration = async (
  filePath: string,
): Promise<number | undefined> => {
  try {
    const { stdout } = await spawnProcessOrThrow({
      command: config.ffprobe,
      args: [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "csv=p=0",
        filePath,
      ],
      kind: "info",
    });
    const duration = parseFloat(stdout);
    return Number.isFinite(duration) ? duration : undefined;
  } catch (error) {
    logger.warning("ffprobe failed", { filePath, error });
    return undefined;
  }
};

const cutIntoParts = async (
  filePath: string,
  outDir: string,
  segmentSeconds: number,
  signal?: AbortSignal,
): Promise<string[]> => {
  await fs.mkdir(outDir, { recursive: true });
  await spawnProcessOrThrow({
    command: config.ffmpeg,
    args: [
      "-hide_banner",
      "-i",
      filePath,
      "-map",
      "0:v:0",
      "-map",
      "0:a?",
      // Stream copy: cut only, never re-encoded
      "-c",
      "copy",
      "-f",
      "segment",
      "-segment_time",
      segmentSeconds.toFixed(3),
      "-reset_timestamps",
      "1",
      "-segment_format",
      "mp4",
      // Playable in Telegram before fully downloaded
      "-segment_format_options",
      "movflags=+faststart",
      "-y",
      path.join(outDir, "part_%03d.mp4"),
    ],
    ignoreStdout: true,
    signal,
  });

  return (await fs.readdir(outDir))
    .filter((f) => f.endsWith(".mp4"))
    .sort()
    .map((f) => path.join(outDir, f));
};

/**
 * Splits a video over Telegram's limit into playable parts that each fit,
 * without re-encoding (cut at keyframes). A video that fits is returned as
 * the only part. The original file is removed once split.
 */
export const splitVideo = async (
  filePath: string,
  options: { duration?: number; signal?: AbortSignal } = {},
): Promise<IVideoPart[]> => {
  const { size } = await fs.stat(filePath);
  if (size <= MAX_FILE_SIZE) {
    return [{ path: filePath, size, duration: options.duration }];
  }

  const duration = options.duration ?? (await probeDuration(filePath));
  if (!duration) throw new UserError(MESSAGES.ERROR.FILE_TOO_LARGE);

  let partCount = getPartCount(size);
  for (let attempt = 1; attempt <= MAX_SPLIT_ATTEMPTS; attempt++) {
    if (partCount > config.maxVideoParts) break;

    const outDir = path.join(path.dirname(filePath), `parts_${partCount}`);
    const files = await cutIntoParts(
      filePath,
      outDir,
      duration / partCount,
      options.signal,
    );
    const sizes = await Promise.all(files.map((f) => fs.stat(f).then((s) => s.size)));
    const largest = Math.max(...sizes);

    if (files.length > 0 && largest <= MAX_FILE_SIZE && files.length <= config.maxVideoParts) {
      await fs.rm(filePath, { force: true }); // free the disk space early
      const durations = await Promise.all(files.map(probeDuration));
      return files.map((f, i) => ({ path: f, size: sizes[i], duration: durations[i] }));
    }

    // Uneven bitrate: a part came out too large, cut finer
    logger.info("Video part over the limit, splitting finer", {
      partCount,
      largest,
      limit: MAX_FILE_SIZE,
    });
    await fs.rm(outDir, { recursive: true, force: true });
    partCount = Math.max(
      partCount + 1,
      Math.ceil((partCount * largest) / (MAX_FILE_SIZE * VIDEO_PART_FILL)),
    );
  }

  throw new UserError(MESSAGES.ERROR.VIDEO_TOO_MANY_PARTS(config.maxVideoParts));
};
