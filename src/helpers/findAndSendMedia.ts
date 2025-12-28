import mongoose, { Model } from "mongoose";
import { IMyContext } from "@/interfaces/IMyContext";
import { IDownload } from "@/interfaces/IDownload";
import logger from "@/config/logger";
import { get, has } from "lodash";
import { ICarouselItem } from "@/interfaces/IInstagramDownload";
import Forward from "@/models/Forward";

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
    // Process findParams: if mediaType is an array, convert to $in operator
    let processedParams: FindParams<T> = findParams;

    // Check if mediaType exists and is an array, then convert to $in operator
    if (
      findParams &&
      typeof findParams === "object" &&
      "mediaType" in findParams &&
      Array.isArray((findParams as Record<string, unknown>).mediaType)
    ) {
      const params = { ...findParams } as Record<string, unknown>;
      params.mediaType = { $in: params.mediaType };
      processedParams = params as FindParams<T>;
    }

    // Find the download record
    const download = await model.findOne(processedParams).lean();

    if (!download) {
      logger.warn("Download not found", { findParams });
      throw new Error("Media not found.");
    }

    const chatId = ctx.chat?.id;
    if (!chatId) {
      logger.error("Chat ID not available in context");
      throw new Error("Unable to send media: chat ID not available.");
    }

    // Helper function to save Forward record
    const saveForwardRecord = async (
      copiedMessageId: number
    ): Promise<void> => {
      if (!ctx.userMongoId) {
        logger.warn("Cannot save forward record: userMongoId not available", {
          downloadId: download._id,
          userId: ctx.from?.id,
        });
        return;
      }

      try {
        await Forward.create({
          user: ctx.userMongoId,
          chatId: chatId,
          messageId: copiedMessageId,
          download: download._id,
        });
        logger.debug("Forward record saved", {
          downloadId: download._id,
          messageId: copiedMessageId,
          userId: ctx.from?.id,
        });
      } catch (error) {
        logger.error("Error saving forward record", {
          error,
          downloadId: download._id,
          messageId: copiedMessageId,
          userId: ctx.from?.id,
        });
        // Don't throw - logging is enough, don't break the copy operation
      }
    };

    if (has(download, "carousel") && get(download, "carousel.length", 0) > 0) {
      const carousel = get(download, "carousel", []);
      const copiedMessages: number[] = [];
      const forwardRecords: Array<{
        user: mongoose.Types.ObjectId;
        chatId: number;
        messageId: number;
        download: mongoose.Types.ObjectId;
      }> = [];

      // Copy all carousel items
      for (const item of carousel as ICarouselItem[]) {
        const result = await ctx.telegram.copyMessage(
          chatId,
          download.chatId,
          item.messageId
        );
        copiedMessages.push(result.message_id);

        // Prepare forward record for batch insert
        if (ctx.userMongoId) {
          forwardRecords.push({
            user: ctx.userMongoId,
            chatId: chatId,
            messageId: result.message_id,
            download: download._id,
          });
        }
      }

      // Batch insert all forward records at once (more efficient)
      if (forwardRecords.length > 0) {
        try {
          await Forward.insertMany(forwardRecords);
          logger.debug("Forward records saved (batch)", {
            downloadId: download._id,
            count: forwardRecords.length,
            userId: ctx.from?.id,
          });
        } catch (error) {
          logger.error("Error saving forward records (batch)", {
            error,
            downloadId: download._id,
            count: forwardRecords.length,
            userId: ctx.from?.id,
          });
          // Don't throw - logging is enough, don't break the copy operation
        }
      }

      logger.info("Carousel copied successfully", {
        downloadId: download._id,
        itemCount: copiedMessages.length,
        messageIds: copiedMessages,
      });
      return 1;
    } else {
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

        // Save forward record for copied message
        await saveForwardRecord(result.message_id);

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

        // Save forward record for forwarded message
        await saveForwardRecord(result.message_id);

        logger.info("Media forwarded successfully", {
          downloadId: download._id,
          messageId: result.message_id,
        });
        return result;
      }
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
