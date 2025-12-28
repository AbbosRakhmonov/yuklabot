import { EMediaType } from "@/enums/EMediaType";
import { EPlatform } from "@/enums/EPlatform";
import { findAndSendMedia } from "@/helpers";
import { IMyContext } from "@/interfaces/IMyContext";
import { ICarouselItem } from "@/interfaces/IInstagramDownload";
import InstagramDownload from "@/models/InstagramDownload";
import { Input } from "telegraf";
import { startContinuousAction } from "@/utils/continuousAction";
import logger from "@/config/logger";

export const instagramStep5 = async (ctx: IMyContext) => {
  const data = ctx.wizard.state.instagram.data;

  const service = ctx.wizard.state.instagram.service;

  const result = await findAndSendMedia(ctx, InstagramDownload, {
    user: ctx.userMongoId,
    url: service.url,
    platform: EPlatform.INSTAGRAM,
    mediaType: EMediaType.POST,
  });

  if (result) return ctx.scene.leave();

  const carouselMedia = data.carousel_media;

  if (!carouselMedia || carouselMedia.length === 0) return ctx.scene.leave();

  if (!ctx.userMongoId || !ctx.chat?.id) {
    logger.warn("Missing userMongoId or chatId for carousel post");
    return ctx.scene.leave();
  }

  // Helper function to send a single carousel item
  const sendCarouselItem = async (
    item: (typeof carouselMedia)[0]
  ): Promise<ICarouselItem[]> => {
    const items: ICarouselItem[] = [];

    try {
      if (item.media_type === EMediaType.VIDEO) {
        // For video: send video with video_url and photo with image_url
        if (item.video_url) {
          const stopVideoAction = startContinuousAction(ctx, "upload_video");
          const sentVideoMessage = await ctx.replyWithVideo(
            Input.fromURL(item.video_url)
          );
          stopVideoAction();

          items.push({
            messageId: sentVideoMessage.message_id,
            itemId: item.id,
            mediaType: EMediaType.VIDEO,
          });

          // Send thumbnail photo if available
          if (item.image_url || item.thumbnail) {
            const stopPhotoAction = startContinuousAction(ctx, "upload_photo");
            const sentPhotoMessage = await ctx.replyWithPhoto(
              Input.fromURL(item.image_url || item.thumbnail || "")
            );
            stopPhotoAction();

            items.push({
              messageId: sentPhotoMessage.message_id,
              itemId: `${item.id}_thumbnail`,
              mediaType: EMediaType.IMAGE,
            });
          }
        }
      } else if (item.media_type === EMediaType.IMAGE) {
        // For image: send photo with image_url only
        if (item.image_url) {
          const stopPhotoAction = startContinuousAction(ctx, "upload_photo");
          const sentPhotoMessage = await ctx.replyWithPhoto(
            Input.fromURL(item.image_url)
          );
          stopPhotoAction();

          items.push({
            messageId: sentPhotoMessage.message_id,
            itemId: item.id,
            mediaType: EMediaType.IMAGE,
          });
        }
      }
    } catch (error) {
      logger.error("Error sending carousel item", {
        error,
        itemId: item.id,
        mediaType: item.media_type,
        userId: ctx.from?.id,
      });
      // Return empty array on error, don't throw to allow other items to process
    }

    return items;
  };

  // Process items sequentially to ensure messages are sent in order
  // Sequential processing guarantees messages arrive in Telegram in the correct order
  const carouselItems: ICarouselItem[] = [];

  for (const item of carouselMedia) {
    const items = await sendCarouselItem(item);
    carouselItems.push(...items);
  }

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
    logger.warn("No carousel items were sent successfully", {
      url: service.url,
      totalItems: carouselMedia.length,
      userId: ctx.from?.id,
    });
  }

  return ctx.scene.leave();
};
