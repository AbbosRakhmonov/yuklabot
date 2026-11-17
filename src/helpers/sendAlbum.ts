import logger from "@/config/logger";
import { EMediaType } from "@/enums/EMediaType";
import { IMyContext } from "@/interfaces/IMyContext";
import { ICarouselItem } from "@/interfaces/IInstagramDownload";
import { withNetworkRetry } from "@/helpers/withNetworkRetry";
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
  // (a URL string is fetched by Telegram itself)
  media: () => InputFile | string;
  itemId: string;
  width?: number;
  height?: number;
}

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
  const message = await withNetworkRetry<{ message_id: number }>(() =>
    item.type === "video"
      ? ctx.replyWithVideo(item.media(), {
          caption,
          width: item.width,
          height: item.height,
          supports_streaming: true,
        })
      : ctx.replyWithPhoto(item.media(), { caption }),
  );
  return toCarouselItem(item, message.message_id);
};

const toInputMedia = (
  item: IAlbumItem,
  caption?: string,
): InputMediaPhoto | InputMediaVideo =>
  item.type === "video"
    ? {
        type: "video",
        media: item.media(),
        caption,
        width: item.width,
        height: item.height,
        supports_streaming: true,
      }
    : { type: "photo", media: item.media(), caption };

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
      const messages = await withNetworkRetry(() =>
        ctx.replyWithMediaGroup(
          chunk.map((item, i) => toInputMedia(item, i === 0 ? chunkCaption : undefined)),
        ),
      );
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
