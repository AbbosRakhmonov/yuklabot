import { deliveryInfo } from "@/utils/requestHistory";
import mongoose, { Model, QueryFilter } from "mongoose";
import { IMyContext } from "@/interfaces/IMyContext";
import { IDownload } from "@/interfaces/IDownload";
import logger from "@/config/logger";
import { get, has } from "lodash";
import { ICarouselItem } from "@/interfaces/IInstagramDownload";
import Forward from "@/models/Forward";
import { InlineKeyboardMarkup, ReplyParameters } from "telegraf/types";
import { EMediaType } from "@/enums/EMediaType";
import { buildCaption } from "@/utils/caption";
import { AlbumDeliveryError } from "@/utils/errors";

interface ISendExtra {
  caption?: string;
  reply_markup?: InlineKeyboardMarkup;
  reply_parameters?: ReplyParameters;
}

/**
 * Sends cached media by its Telegram file_id (no upload, no local file)
 */
const sendByFileId = (
  ctx: IMyContext,
  download: { fileId?: string; mediaType: EMediaType },
  extra: ISendExtra
): Promise<{ message_id: number }> => {
  const fileId = download.fileId as string;
  switch (download.mediaType) {
    case EMediaType.VIDEO:
    case EMediaType.REEL:
      return ctx.replyWithVideo(fileId, { ...extra, supports_streaming: true });
    case EMediaType.AUDIO:
      return ctx.replyWithAudio(fileId, extra);
    case EMediaType.IMAGE:
      return ctx.replyWithPhoto(fileId, extra);
    default:
      return ctx.replyWithDocument(fileId, extra);
  }
};

/**
 * Type helper to extract queryable fields from a model type
 * Uses the same type that Mongoose's findOne expects
 */
type FindParams<T extends IDownload> = QueryFilter<T>;

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
    preferFileId?: boolean;
    useCopy?: boolean; // Use copyMessage instead of forwardMessage (default: true)
    caption?: string; // Optional caption for copied messages
    fromChatId?: number; // Override the from chat ID (default: download.chatId)
    // Inline keyboard for the copied message, built from the cached record id
    replyMarkup?: (downloadId: string) => InlineKeyboardMarkup;
    replyToMessageId?: number;
  }
): Promise<unknown> => {
  let sendingSharedFile = false;
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

    // Find the newest download record (shared across all users)
    const download = await model
      .findOne({ ...processedParams, cacheIncomplete: { $ne: true } })
      .sort({ createdAt: -1 })
      .lean();

    if (!download) {
      return null;
    }

    deliveryInfo({ mode: "cached" });
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
        logger.warning(
          "Cannot save forward record: userMongoId not available",
          {
            downloadId: download._id,
            userId: ctx.from?.id,
          }
        );
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

      // copyMessages keeps albums grouped (sent as one media group);
      // it takes up to 100 message ids, in increasing order
      const messageIds = (carousel as ICarouselItem[])
        .map((item) => item.messageId)
        .sort((a, b) => a - b);
      for (let i = 0; i < messageIds.length; i += 100) {
        const results = await ctx.telegram.copyMessages(
          chatId,
          download.chatId,
          messageIds.slice(i, i + 100)
        ).catch(error => {
          if (copiedMessages.length) throw new AlbumDeliveryError(copiedMessages.length, messageIds.length);
          throw error;
        });
        copiedMessages.push(...results.map((r) => r.message_id));
      }

      // Prepare forward records for batch insert
      if (ctx.userMongoId) {
        for (const messageId of copiedMessages) {
          forwardRecords.push({
            user: ctx.userMongoId,
            chatId: chatId,
            messageId,
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

      if (copiedMessages.length < messageIds.length) {
        await model.updateOne({ _id: download._id }, { $set: { cacheIncomplete: true } })
          .catch(error => logger.warning("Could not mark incomplete cached album", { error, downloadId: download._id }));
        if (!copiedMessages.length) return null;
        throw new AlbumDeliveryError(copiedMessages.length, messageIds.length);
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
        const extra = {
          reply_markup: options?.replyMarkup?.(String(download._id)),
          reply_parameters: options?.replyToMessageId
            ? {
                message_id: options.replyToMessageId,
                allow_sending_without_reply: true,
              }
            : undefined,
        };

        if (options?.preferFileId && download.fileId) {
          sendingSharedFile = true;
          const sent = await sendByFileId(ctx, download, { ...extra, caption: options.caption ?? buildCaption(ctx, download.fileName) });
          await saveForwardRecord(sent.message_id);
          return sent;
        }

        let result: { message_id: number };
        try {
          result = await ctx.telegram.copyMessage(
            chatId,
            fromChatId,
            download.messageId,
            { ...extra, caption: options?.caption }
          );
        } catch (copyError) {
          // The original message is gone (chat deleted, bot blocked...):
          // the file still lives on Telegram, send it by file_id
          if (!download.fileId) throw copyError;
          logger.warning("Copy failed, sending cached media by file_id", {
            downloadId: download._id,
            error:
              copyError instanceof Error ? copyError.message : String(copyError),
          });
          result = await sendByFileId(ctx, download, {
            ...extra,
            caption: options?.caption ?? buildCaption(ctx, null),
          });
        }

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
    if (sendingSharedFile || error instanceof AlbumDeliveryError) throw error;
    return null;
  }
};
