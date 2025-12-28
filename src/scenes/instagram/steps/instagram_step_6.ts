import { IMyContext } from "@/interfaces/IMyContext";
import { Input } from "telegraf";
import { startContinuousAction } from "@/utils/continuousAction";
import InstagramDownload from "@/models/InstagramDownload";
import { EPlatform } from "@/enums/EPlatform";
import { EMediaType } from "@/enums/EMediaType";
import { findAndSendMedia } from "@/helpers";

export const instagramStep6 = async (ctx: IMyContext) => {
  const service = ctx.wizard.state.instagram.service;
  const data = ctx.wizard.state.instagram.data;

  // Check if image already exists in database
  const result = await findAndSendMedia(ctx, InstagramDownload, {
    user: ctx.userMongoId,
    url: service.url,
    platform: EPlatform.INSTAGRAM,
    mediaType: EMediaType.IMAGE,
  });

  // If media not found, send it and save to database
  if (!result) {
    if (data.image_url) {
      const stopAction = startContinuousAction(ctx, "upload_photo");
      const sentMessage = await ctx.replyWithPhoto(Input.fromURL(data.image_url));
      stopAction();

      if (ctx.userMongoId) {
        await InstagramDownload.create({
          user: ctx.userMongoId,
          url: service.url,
          chatId: ctx.chat?.id || ctx.from?.id || 0,
          messageId: sentMessage.message_id,
          platform: EPlatform.INSTAGRAM,
          fileName: data.title || data.shortcode || "instagram_image",
          fileSize: 0,
          mediaType: EMediaType.IMAGE,
        });
      }
    }
  }

  return ctx.scene.leave();
};

