import { MESSAGES } from "@/constants";
import { IMyContext } from "@/interfaces/IMyContext";
import fs from "fs/promises";
import path from "path";
import { config } from "@/config/config";
import { Input } from "telegraf";
import YoutubeDownload from "@/models/YoutubeDownload";
import { EPlatform } from "@/enums/EPlatform";
import { EMediaType } from "@/enums/EMediaType";
import { findAndSendMedia } from "@/helpers";
import { YoutubeService } from "@/services";

export const youtubeStep4 = async (ctx: IMyContext) => {
  // Get service from state or recreate it
  const serviceState = ctx.wizard.state.youtube.service;
  const service = new YoutubeService(serviceState.url);
  // Restore state data
  service.data = serviceState.data;
  service.formatId = serviceState.formatId;
  service.folderName = serviceState.folderName;

  const result = await findAndSendMedia(ctx, YoutubeDownload, {
    user: ctx.userMongoId,
    url: service.url,
    platform: EPlatform.YOUTUBE,
    mediaType: EMediaType.AUDIO,
    height: 0,
  });

  if (!result) {
    const message = await ctx.sendMessage(MESSAGES.INFO.DOWNLOADING_AUDIO);

    try {
      const folderName = await service.downloadAudio();
      const folderPath = path.join(config.downloadDir, folderName);
      const files = await fs.readdir(folderPath);
      const filePath = path.join(folderPath, files[0]);
      await ctx.deleteMessage(message.message_id);
      const audioStream = (await import("fs")).createReadStream(filePath);
      const sentMessage = await ctx.replyWithAudio(
        Input.fromReadableStream(audioStream)
      );
      const fileName = path.basename(filePath);
      const stats = await fs.stat(filePath);
      const fileSize = stats.size;

      // Create YoutubeDownload record
      if (ctx.userMongoId) {
        await YoutubeDownload.create({
          user: ctx.userMongoId,
          url: service.url,
          chatId: ctx.chat?.id || ctx.from?.id || 0,
          messageId: sentMessage.message_id,
          platform: EPlatform.YOUTUBE,
          fileName: fileName,
          fileSize: fileSize,
          mediaType: EMediaType.AUDIO,
          height: 0,
        });
      }
    } finally {
      // Now cleanupFolder will work
      await service.cleanupFolder();
    }
  }

  return ctx.scene.leave();
};
