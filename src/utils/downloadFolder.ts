import fs from "fs/promises";
import path from "path";
import { config } from "@/config/config";
import { MAX_FILE_SIZE, MESSAGES } from "@/constants";
import logger from "@/config/logger";
import { myDayjs } from "@/utils/myDayjs";
import { UserError } from "@/utils/errors";

export const VIDEO_EXTENSIONS = [".mp4", ".mkv", ".webm", ".mov"];
export const AUDIO_EXTENSIONS = [".mp3", ".m4a", ".opus", ".ogg", ".aac"];

/**
 * Creates a unique folder inside the download directory and returns its name
 */
export const createDownloadFolder = async (suffix: string): Promise<string> => {
  const timeStamp = myDayjs().format("YYYY-MM-DD_HH-mm-ss");
  const random = Math.random().toString(36).slice(2, 8);
  const safeSuffix = suffix.replace(/[^a-zA-Z0-9_-]/g, "_");
  const folderName = `${timeStamp}_${random}_${safeSuffix}`;

  await fs.mkdir(path.join(config.downloadDir, folderName), {
    recursive: true,
  });
  return folderName;
};

export const getDownloadFolderPath = (folderName: string): string =>
  path.join(config.downloadDir, folderName);

/**
 * Removes a download folder, never throws
 */
export const removeDownloadFolder = async (
  folderName: string | null,
): Promise<void> => {
  if (!folderName) return;

  try {
    await fs.rm(getDownloadFolderPath(folderName), {
      recursive: true,
      force: true,
    });
  } catch (error) {
    logger.error("Failed to cleanup folder", { folderName, error });
  }
};

/**
 * Finds the largest file with one of the given extensions in a download folder
 */
export const findMediaFile = async (
  folderName: string,
  extensions: string[],
): Promise<string> => {
  const folderPath = getDownloadFolderPath(folderName);
  const files = await fs.readdir(folderPath);

  let bestPath: string | null = null;
  let bestSize = -1;

  for (const file of files) {
    if (!extensions.includes(path.extname(file).toLowerCase())) continue;

    const filePath = path.join(folderPath, file);
    const stats = await fs.stat(filePath);
    if (stats.isFile() && stats.size > bestSize) {
      bestPath = filePath;
      bestSize = stats.size;
    }
  }

  if (!bestPath) {
    logger.error("Media file not found in download folder", {
      folderName,
      files,
      extensions,
    });
    throw new UserError(MESSAGES.ERROR.MEDIA_NOT_FOUND);
  }

  return bestPath;
};

/**
 * Returns file size, throws a user-facing error if Telegram can't accept it
 */
export const getUploadableFileSize = async (
  filePath: string,
): Promise<number> => {
  const { size } = await fs.stat(filePath);
  if (size > MAX_FILE_SIZE) {
    throw new UserError(MESSAGES.ERROR.FILE_TOO_LARGE);
  }
  return size;
};
