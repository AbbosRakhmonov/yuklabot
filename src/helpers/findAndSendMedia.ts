import { Model } from "mongoose";
import { IMyContext } from "@/interfaces/IMyContext";
import { IDownload } from "@/interfaces/IDownload";
import logger from "@/config/logger";

/**
 * Type helper to extract queryable fields from a model type
 * Uses the same type that Mongoose's findOne expects
 */
type FindParams<T extends IDownload> = Parameters<Model<T>["findOne"]>[0];

/**
 * Find media through given properties and send message to user
 * @param ctx - Telegram bot context
 * @param model - Mongoose model to query (e.g., YoutubeDownload, Download)
 * @param findParams - Query parameters to find the download record (only fields from the model)
 * @param options - Optional configuration
 * @returns The sent message or null if not found/error
 */
export const findAndSendMedia = async <T extends IDownload>(
  ctx: IMyContext,
  model: Model<T>,
  findParams: FindParams<T>,
  options?: {
    useCopy?: boolean; // Use copyMessage instead of forwardMessage (default: true)
    caption?: string; // Optional caption for copied messages
    fromChatId?: number; // Override the from chat ID (default: download.chatId)
  }
): Promise<unknown> => {
  try {
    // Find the download record
    const download = await model.findOne(findParams).lean();

    if (!download) {
      logger.warn("Download not found", { findParams });
      throw new Error("Media not found.");
    }

    const chatId = ctx.chat?.id;
    if (!chatId) {
      logger.error("Chat ID not available in context");
      throw new Error("Unable to send media: chat ID not available.");
    }

    const fromChatId = options?.fromChatId || download.chatId;
    const useCopy = options?.useCopy !== false; // Default to true

    // Use copyMessage to resend the media (allows custom caption)
    // Use forwardMessage to forward the original message
    if (useCopy) {
      const result = await ctx.telegram.copyMessage(
        chatId,
        fromChatId,
        download.messageId,
        {
          caption: options?.caption,
        }
      );
      logger.info("Media copied successfully", {
        downloadId: download._id,
        messageId: result.message_id,
      });
      return result;
    } else {
      const result = await ctx.telegram.forwardMessage(
        chatId,
        fromChatId,
        download.messageId
      );
      logger.info("Media forwarded successfully", {
        downloadId: download._id,
        messageId: result.message_id,
      });
      return result;
    }
  } catch (error) {
    logger.error("Error finding and sending media", {
      error,
      findParams,
      userId: ctx.from?.id,
    });
    return null;
  }
};
