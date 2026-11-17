import { EMediaType } from "@/enums/EMediaType";
import { EPlatform } from "@/enums/EPlatform";
import { findAndSendMedia, IAlbumItem, sendAlbum } from "@/helpers";
import { IMyContext } from "@/interfaces/IMyContext";
import InstagramDownload from "@/models/InstagramDownload";
import { Input } from "telegraf";
import { startContinuousAction } from "@/utils/continuousAction";
import { buildCaption } from "@/utils/caption";
import logger from "@/config/logger";

/**
 * Carousel post: all items as one album (groups of 10)
 */
export const instagramStep5 = async (ctx: IMyContext) => {
  const data = ctx.wizard.state.instagram.data;

  const service = ctx.wizard.state.instagram.service;

  const result = await findAndSendMedia(ctx, InstagramDownload, {
    url: service.url,
    platform: EPlatform.INSTAGRAM,
    mediaType: EMediaType.POST,
  });

  if (result) return ctx.scene.leave();

  const carouselMedia = data.carousel_media;

  if (!carouselMedia || carouselMedia.length === 0) return ctx.scene.leave();

  if (!ctx.userMongoId || !ctx.chat?.id) {
    logger.warning("Missing userMongoId or chatId for carousel post");
    return ctx.scene.leave();
  }

  const albumItems: IAlbumItem[] = [];
  for (const item of carouselMedia) {
    const videoUrl = item.video_url;
    const imageUrl = item.image_url;

    if (item.media_type === EMediaType.VIDEO && videoUrl) {
      albumItems.push({
        type: "video",
        media: () => Input.fromURLStream(videoUrl),
        itemId: item.id,
        width: item.width,
        height: item.height,
      });
    } else if (item.media_type === EMediaType.IMAGE && imageUrl) {
      albumItems.push({
        type: "photo",
        media: () => Input.fromURL(imageUrl),
        itemId: item.id,
      });
    }
  }

  const stopAction = startContinuousAction(ctx, "upload_photo");
  const carouselItems = await sendAlbum(
    ctx,
    albumItems,
    buildCaption(ctx, null)
  ).finally(stopAction);

  // Save all carousel items to database
  if (carouselItems.length > 0) {
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
  } else {
    logger.warning("No carousel items were sent successfully", {
      url: service.url,
      totalItems: carouselMedia.length,
      userId: ctx.from?.id,
    });
  }

  return ctx.scene.leave();
};
