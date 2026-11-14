import { MESSAGES } from "@/constants";
import { IMyContext } from "@/interfaces/IMyContext";
import path from "path";
import { Input } from "telegraf";
import YoutubeDownload from "@/models/YoutubeDownload";
import { EPlatform } from "@/enums/EPlatform";
import { EMediaType } from "@/enums/EMediaType";
import { findAndSendMedia } from "@/helpers";
import { YoutubeService } from "@/services";
import {
  AUDIO_EXTENSIONS,
  findMediaFile,
  getUploadableFileSize,
} from "@/utils/downloadFolder";
import { createReadStream } from "fs";

export const youtubeStep4 = async (ctx: IMyContext) => {
  // Get service from state or recreate it
  const serviceState = ctx.wizard.state.youtube.service;
  const service = new YoutubeService(serviceState.url);
  // Restore state data
  service.data = serviceState.data;
  service.formatId = serviceState.formatId;
  service.folderName = serviceState.folderName;

  const result = await findAndSendMedia(ctx, YoutubeDownload, {
    url: service.url,
    platform: EPlatform.YOUTUBE,
    mediaType: EMediaType.AUDIO,
    height: 0,
  });

  if (!result) {
    const message = await ctx.sendMessage(MESSAGES.INFO.DOWNLOADING_AUDIO);

    try {
      const folderName = await service.downloadAudio();
      const filePath = await findMediaFile(folderName, AUDIO_EXTENSIONS);
      const fileSize = await getUploadableFileSize(filePath);
      await ctx.deleteMessage(message.message_id);
      const sentMessage = await ctx.replyWithAudio(
        Input.fromReadableStream(createReadStream(filePath))
      );

      // Create YoutubeDownload record
      if (ctx.userMongoId) {
        await YoutubeDownload.create({
          user: ctx.userMongoId,
          url: service.url,
          chatId: ctx.chat?.id || ctx.from?.id || 0,
          messageId: sentMessage.message_id,
          platform: EPlatform.YOUTUBE,
          fileName: path.basename(filePath),
          fileSize,
          mediaType: EMediaType.AUDIO,
          height: 0,
        });
      }
    } catch (error) {
      await ctx.deleteMessage(message.message_id).catch(() => {});
      throw error;
    } finally {
      await service.cleanupFolder();
    }
  }

  return ctx.scene.leave();
};
