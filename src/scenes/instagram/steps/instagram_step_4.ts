import { MESSAGES } from "@/constants";
import { IMyContext } from "@/interfaces/IMyContext";
import { callbackQuery } from "telegraf/filters";
import path from "path";
import InstagramDownload from "@/models/InstagramDownload";
import { EPlatform } from "@/enums/EPlatform";
import { EMediaType } from "@/enums/EMediaType";
import { findAndSendMedia, getMessageFileId } from "@/helpers";
import { InstagramService } from "@/services";
import { getUploadableFileSize, toUploadInput } from "@/utils/downloadFolder";
import { UserError } from "@/utils/errors";

export const instagramStep4 = async (ctx: IMyContext) => {
  if (ctx.has(callbackQuery("data"))) {
    await ctx.answerCbQuery();

    // The session keeps only the service's fields: rebuild it
    const serviceState = ctx.wizard.state.instagram.service;
    const service = new InstagramService(serviceState.url);
    service.data = ctx.wizard.state.instagram.data ?? serviceState.data;
    service.proxyId = serviceState.proxyId ?? null;

    const result = await findAndSendMedia(ctx, InstagramDownload, {
      url: service.url,
      platform: EPlatform.INSTAGRAM,
      mediaType: EMediaType.AUDIO,
    });

    if (!result) {
      const videoUrl = service.data?.video_url;
      if (!videoUrl) throw new UserError(MESSAGES.ERROR.MEDIA_NOT_FOUND);

      const message = await ctx.sendMessage(MESSAGES.INFO.DOWNLOADING_AUDIO);

      try {
        const audioPath = await service.extractAudio(videoUrl);
        const fileSize = await getUploadableFileSize(audioPath);
        await ctx.deleteMessage(message.message_id);
        const sentMessage = await ctx.replyWithAudio(
          toUploadInput(audioPath)
        );
        const fileName = path.basename(audioPath);

        // Create InstagramDownload record
        if (ctx.userMongoId) {
          await InstagramDownload.create({
            user: ctx.userMongoId,
            url: service.url,
            chatId: ctx.chat?.id || ctx.from?.id || 0,
            messageId: sentMessage.message_id,
            fileId: getMessageFileId(sentMessage),
            platform: EPlatform.INSTAGRAM,
            fileName: fileName,
            fileSize: fileSize,
            mediaType: EMediaType.AUDIO,
          });
        }
      } catch (error) {
        await ctx.deleteMessage(message.message_id).catch(() => {});
        throw error;
      } finally {
        await service.cleanupFolder();
      }
    }
  }
  return ctx.scene.leave();
};
