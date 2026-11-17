import { MESSAGES } from "@/constants";
import { IMyContext } from "@/interfaces/IMyContext";
import { ICarouselItem } from "@/interfaces/IInstagramDownload";
import { EMediaType } from "@/enums/EMediaType";
import { getMessageFileId } from "@/helpers/getMessageFileId";
import { toUploadInput } from "@/utils/downloadFolder";
import { ProgressMessage } from "@/utils/progressMessage";
import { getPartCount, splitVideo } from "@/utils/videoSplit";
import fs from "fs/promises";
import {
  InlineKeyboardMarkup,
  InputFile,
} from "telegraf/typings/core/types/typegram";

export interface ISendVideoOptions {
  caption?: string;
  width?: number;
  height?: number;
  duration?: number; // seconds
  thumbnail?: () => InputFile; // factory: each part needs a fresh stream
  replyMarkup?: InlineKeyboardMarkup; // under the (first) video
}

export interface ISentVideo {
  messageId: number; // the (first) message
  fileId?: string; // single video only
  totalSize: number;
  parts?: ICarouselItem[]; // when sent in parts
}

/**
 * Sends a downloaded video; if it's over Telegram's limit it is cut into
 * parts first (never re-encoded) and sent as "1/3-qism", "2/3-qism"...
 */
export const sendVideoFile = async (
  ctx: IMyContext,
  filePath: string,
  progress: ProgressMessage,
  options: ISendVideoOptions,
): Promise<ISentVideo> => {
  const { size } = await fs.stat(filePath);
  if (getPartCount(size) > 1) {
    await progress.setText(MESSAGES.INFO.SPLITTING);
  }

  const parts = await splitVideo(filePath, {
    duration: options.duration,
    signal: progress.signal,
  });
  const total = parts.length;

  const messages = [];
  for (const [i, part] of parts.entries()) {
    await progress.setText(
      total > 1
        ? MESSAGES.INFO.UPLOADING_PART(i + 1, total)
        : MESSAGES.INFO.UPLOADING,
    );

    const caption =
      total > 1
        ? [options.caption, `📦 ${i + 1}/${total}-qism`]
            .filter(Boolean)
            .join("\n\n")
        : options.caption;

    messages.push(
      await ctx.replyWithVideo(toUploadInput(part.path), {
        caption,
        width: options.width,
        height: options.height,
        duration: part.duration ? Math.round(part.duration) : undefined,
        thumbnail: options.thumbnail?.(),
        supports_streaming: true,
        reply_markup: i === 0 ? options.replyMarkup : undefined,
      }),
    );
  }

  return {
    messageId: messages[0].message_id,
    fileId: total === 1 ? getMessageFileId(messages[0]) : undefined,
    totalSize: parts.reduce((sum, p) => sum + p.size, 0),
    parts:
      total > 1
        ? messages.map((m, i) => ({
            messageId: m.message_id,
            itemId: `part${i + 1}`,
            mediaType: EMediaType.VIDEO,
          }))
        : undefined,
  };
};
