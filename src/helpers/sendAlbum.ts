import logger from "@/config/logger";
import { EMediaType } from "@/enums/EMediaType";
import { IMyContext } from "@/interfaces/IMyContext";
import { ICarouselItem } from "@/interfaces/IInstagramDownload";
import { withNetworkRetry } from "@/helpers/withNetworkRetry";
import { destroyInput } from "@/utils/cdnInput";
import {
  InputFile,
  InputMediaPhoto,
  InputMediaVideo,
} from "telegraf/typings/core/types/typegram";

// Telegram allows 2-10 items per media group
const MAX_GROUP_SIZE = 10;

export interface IAlbumItem {
  type: "photo" | "video";
  // A factory: streams can only be read once, retries need a fresh one
  // (a URL string is fetched by Telegram itself); may open the stream async
  media: () => MediaFactoryResult;
  // Tried when `media` can't be sent on its own (e.g. Telegram couldn't
  // fetch the URL): usually the same file streamed through the server
  fallbackMedia?: () => MediaFactoryResult;
  itemId: string;
  width?: number;
  height?: number;
}

type MediaFactoryResult = InputFile | string | Promise<InputFile | string>;

const toCarouselItem = (
  item: IAlbumItem,
  messageId: number,
): ICarouselItem => ({
  messageId,
  itemId: item.itemId,
  mediaType: item.type === "video" ? EMediaType.VIDEO : EMediaType.IMAGE,
});

const sendSingle = async (
  ctx: IMyContext,
  item: IAlbumItem,
  caption?: string,
): Promise<ICarouselItem> => {
  const send = (factory: () => MediaFactoryResult) =>
    withNetworkRetry<{ message_id: number }>(async () => {
      const media = await factory();
      try {
        return item.type === "video"
          ? await ctx.replyWithVideo(media, {
              caption,
              width: item.width,
              height: item.height,
              supports_streaming: true,
            })
          : await ctx.replyWithPhoto(media, { caption });
      } catch (error) {
        destroyInput(media);
        throw error;
      }
    });

  let message: { message_id: number };
  try {
    message = await send(item.media);
  } catch (error) {
    if (!item.fallbackMedia) throw error;
    logger.warning("Album item failed, trying its fallback media", {
      itemId: item.itemId,
      error: error instanceof Error ? error.message : String(error),
    });
    message = await send(item.fallbackMedia);
  }
  return toCarouselItem(item, message.message_id);
};

const toInputMedia = (
  item: IAlbumItem,
  media: InputFile | string,
  caption?: string,
): InputMediaPhoto | InputMediaVideo =>
  item.type === "video"
    ? {
        type: "video",
        media,
        caption,
        width: item.width,
        height: item.height,
        supports_streaming: true,
      }
    : { type: "photo", media, caption };

/**
 * Opens every item's media; if one fails, closes the ones already opened
 */
const openAll = async (items: IAlbumItem[]): Promise<(InputFile | string)[]> => {
  const results = await Promise.allSettled(items.map(async (item) => item.media()));
  const failed = results.find(
    (r): r is PromiseRejectedResult => r.status === "rejected",
  );
  if (failed) {
    for (const r of results) if (r.status === "fulfilled") destroyInput(r.value);
    throw failed.reason;
  }
  return results.map((r) => (r as PromiseFulfilledResult<InputFile | string>).value);
};

/**
 * Sends items as albums of up to 10 (caption on the first one).
 * If an album fails (e.g. one broken URL), its items are sent one by one and
 * only the broken ones are skipped.
 */
export const sendAlbum = async (
  ctx: IMyContext,
  items: IAlbumItem[],
  caption?: string,
): Promise<ICarouselItem[]> => {
  const sent: ICarouselItem[] = [];

  for (let start = 0; start < items.length; start += MAX_GROUP_SIZE) {
    const chunk = items.slice(start, start + MAX_GROUP_SIZE);
    const chunkCaption = start === 0 ? caption : undefined;

    if (chunk.length === 1) {
      sent.push(await sendSingle(ctx, chunk[0], chunkCaption));
      continue;
    }

    try {
      const messages = await withNetworkRetry(async () => {
        const media = await openAll(chunk);
        try {
          return await ctx.replyWithMediaGroup(
            chunk.map((item, i) =>
              toInputMedia(item, media[i], i === 0 ? chunkCaption : undefined),
            ),
          );
        } catch (error) {
          media.forEach(destroyInput);
          throw error;
        }
      });
      messages.forEach((message, i) =>
        sent.push(toCarouselItem(chunk[i], message.message_id)),
      );
    } catch (error) {
      logger.warning("Album failed, sending items one by one", {
        error: error instanceof Error ? error.message : String(error),
        userId: ctx.from?.id,
      });
      for (const [i, item] of chunk.entries()) {
        try {
          sent.push(await sendSingle(ctx, item, i === 0 ? chunkCaption : undefined));
        } catch (itemError) {
          logger.error("Error sending album item", {
            error: itemError,
            itemId: item.itemId,
            userId: ctx.from?.id,
          });
        }
      }
    }
  }

  return sent;
};
