import { IMyContext } from "@/interfaces/IMyContext";
import { callbackQuery } from "telegraf/filters";
import { startContinuousAction } from "@/utils/continuousAction";
import InstagramDownload from "@/models/InstagramDownload";
import { EPlatform } from "@/enums/EPlatform";
import { EMediaType } from "@/enums/EMediaType";
import { findAndSendMedia } from "@/helpers";
import { Input } from "telegraf";

export const instagramStep3 = async (ctx: IMyContext) => {
  if (ctx.has(callbackQuery("data"))) {
    await ctx.answerCbQuery();

    const service = ctx.wizard.state.instagram.service;
    const data = ctx.wizard.state.instagram.data;

    const result = await findAndSendMedia(ctx, InstagramDownload, {
      user: ctx.userMongoId,
      url: service.url,
      platform: EPlatform.INSTAGRAM,
      mediaType: EMediaType.VIDEO,
    });

    if (!result) {
      const stopVideoAction = startContinuousAction(ctx, "upload_video");
      try {
        const sentMessage = await ctx.replyWithVideo(
          Input.fromURLStream(data.video_url as string)
        );

        stopVideoAction();

        if (ctx.userMongoId) {
          await InstagramDownload.create({
            user: ctx.userMongoId,
            url: service.url,
            chatId: ctx.chat?.id || ctx.from?.id || 0,
            messageId: sentMessage.message_id,
            platform: EPlatform.INSTAGRAM,
            fileName: data?.title ?? "",
            fileSize: 0,
            mediaType: EMediaType.VIDEO,
          });
        }
      } catch (error) {
        stopVideoAction();
        throw error;
      }
    }
  }
  return ctx.scene.leave();
};
