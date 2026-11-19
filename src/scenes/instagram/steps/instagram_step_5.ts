import { sharedDownload } from "@/helpers/sharedDownload";
import { deliveryConfirmed, deliveryStage, observeAttempt } from "@/utils/deliveryAttempt";
import { UserError } from "@/utils/errors";
import { MESSAGES } from "@/constants";
import { EMediaType } from "@/enums/EMediaType";
import { EPlatform } from "@/enums/EPlatform";
import { findAndSendMedia, IAlbumItem, sendAlbum } from "@/helpers";
import { IMyContext } from "@/interfaces/IMyContext";
import InstagramDownload from "@/models/InstagramDownload";
import { Input } from "telegraf";
import { openCdnStream } from "@/utils/cdnInput";
import { startContinuousAction } from "@/utils/continuousAction";
import { buildCaption } from "@/utils/caption";
import logger from "@/config/logger";

/**
 * Carousel post: all items as one album (groups of 10)
 */
export const instagramStep5 = async (ctx: IMyContext) => {
  const { service } = ctx.wizard.state.instagram;
  await observeAttempt(ctx, EPlatform.INSTAGRAM, "source", () => sharedDownload(ctx,
    [EPlatform.INSTAGRAM, service.url, EMediaType.POST],
    preferFileId => findAndSendMedia(ctx, InstagramDownload, {
      url: service.url, platform: EPlatform.INSTAGRAM, mediaType: EMediaType.POST,
    }, { preferFileId }),
    () => uploadCarousel(ctx),
  ));
  return ctx.scene.leave();
};

async function uploadCarousel(ctx: IMyContext) {
  const { service, data } = ctx.wizard.state.instagram;
  const carouselMedia = data.carousel_media;
  if (!carouselMedia?.length) throw new UserError(MESSAGES.ERROR.MEDIA_NOT_FOUND);

  const albumItems: IAlbumItem[] = [];
  for (const item of carouselMedia) {
    const videoUrl = item.video_url;
    const imageUrl = item.image_url;

    if (item.media_type === EMediaType.VIDEO && videoUrl) {
      albumItems.push({
        type: "video",
        // Streamed from the CDN, nothing on disk
        media: () => openCdnStream(videoUrl, service.proxyId, "video.mp4"),
        itemId: item.id,
        width: item.width,
        height: item.height,
      });
    } else if (item.media_type === EMediaType.IMAGE && imageUrl) {
      albumItems.push({
        type: "photo",
        // By URL: Telegram fetches it itself, no traffic through us
        media: () => Input.fromURL(imageUrl),
        // If Telegram can't fetch it: streamed through us
        fallbackMedia: () => openCdnStream(imageUrl, service.proxyId, "photo.jpg"),
        itemId: item.id,
      });
    }
  }

  deliveryStage("telegram");
  const stopAction = startContinuousAction(ctx, "upload_photo");
  const carouselItems = await sendAlbum(
    ctx,
    albumItems,
    buildCaption(ctx, null),
    carouselMedia.length
  ).finally(stopAction);

  // Save all carousel items to database
  deliveryConfirmed();
  if (ctx.userMongoId && ctx.chat) {
    try {
      await InstagramDownload.create({
        user: ctx.userMongoId,
        url: service.url,
        chatId: ctx.chat.id,
        messageId: carouselItems[0].messageId, // Use first message ID as primary
        platform: EPlatform.INSTAGRAM,
        fileName: data.title || `carousel_${data.shortcode || "post"}`,
        fileSize: 0,
        mediaType: EMediaType.POST,
        carousel: carouselItems,
      });

      logger.info("Carousel saved successfully", {
        url: service.url,
        itemCount: carouselItems.length,
        userId: ctx.from?.id,
      });
    } catch (error) {
      logger.error("Error saving carousel to database", {
        error,
        url: service.url,
        itemCount: carouselItems.length,
        userId: ctx.from?.id,
      });
    }
  }
}
