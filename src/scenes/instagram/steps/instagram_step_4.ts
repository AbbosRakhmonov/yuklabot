import { MESSAGES } from "@/constants";
import { IMyContext } from "@/interfaces/IMyContext";
import { Input } from "telegraf";
import { callbackQuery } from "telegraf/filters";
import path from "path";
import InstagramDownload from "@/models/InstagramDownload";
import { EPlatform } from "@/enums/EPlatform";
import { EMediaType } from "@/enums/EMediaType";
import { findAndSendMedia } from "@/helpers";
import { InstagramService } from "@/services";
import {
  findMediaFile,
  getUploadableFileSize,
  VIDEO_EXTENSIONS,
} from "@/utils/downloadFolder";

export const instagramStep4 = async (ctx: IMyContext) => {
  if (ctx.has(callbackQuery("data"))) {
    await ctx.answerCbQuery();

    // Get service from state or recreate it
    const serviceState = ctx.wizard.state.instagram.service;
    const service = new InstagramService(serviceState.url);
    // Restore state data
    service.data = serviceState.data;
    service.galleryDlData = serviceState.galleryDlData;
    service.galleryDlRawData = serviceState.galleryDlRawData;
    service.folderName = serviceState.folderName;

    const result = await findAndSendMedia(ctx, InstagramDownload, {
      url: service.url,
      platform: EPlatform.INSTAGRAM,
      mediaType: EMediaType.AUDIO,
    });

    if (!result) {
      const message = await ctx.sendMessage(MESSAGES.INFO.DOWNLOADING_AUDIO);

      try {
        const folderName = await service.download();
        const filePath = await findMediaFile(folderName, VIDEO_EXTENSIONS);
        const audioPath = await service.extractAudio(filePath);
        const fileSize = await getUploadableFileSize(audioPath);
        await ctx.deleteMessage(message.message_id);
        const sentMessage = await ctx.replyWithAudio(
          Input.fromLocalFile(audioPath)
        );
        const fileName = path.basename(audioPath);

        // Create InstagramDownload record
        if (ctx.userMongoId) {
          await InstagramDownload.create({
            user: ctx.userMongoId,
            url: service.url,
            chatId: ctx.chat?.id || ctx.from?.id || 0,
            messageId: sentMessage.message_id,
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
