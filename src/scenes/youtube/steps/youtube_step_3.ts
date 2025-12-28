import { MESSAGES } from "@/constants";
import { callbackQuery } from "telegraf/filters";
import fs from "fs/promises";
import path from "path";
import { config } from "@/config/config";
import { Input } from "telegraf";
import { startContinuousAction } from "@/utils/continuousAction";
import { IMyContext } from "@/interfaces/IMyContext";
import { handleCancelButton } from "@/scenes/helpers";
import YoutubeDownload from "@/models/YoutubeDownload";
import { EPlatform } from "@/enums/EPlatform";
import { EMediaType } from "@/enums/EMediaType";
import { findAndSendMedia } from "@/helpers";

export const youtubeStep3 = async (ctx: IMyContext) => {
  if (ctx.has(callbackQuery("data"))) {
    await ctx.answerCbQuery();

    const data = ctx.callbackQuery.data;

    await handleCancelButton(ctx, data);

    const height = data;

    await ctx.deleteMessage();

    const service = ctx.wizard.state.youtube.service;

    const result = await findAndSendMedia(ctx, YoutubeDownload, {
      user: ctx.userMongoId,
      url: service.url,
      platform: EPlatform.YOUTUBE,
      height: Number(height),
      mediaType: EMediaType.VIDEO,
    });

    if (!result) {
      const message = await ctx.sendMessage(MESSAGES.INFO.DOWNLOADING_VIDEO);

      let stopVideoAction: (() => void) | null = null;
      try {
        const folderName = await service.downloadVideo(height);
        stopVideoAction = startContinuousAction(ctx, "upload_video");
        // get first file in folder
        const folderPath = path.join(config.downloadDir, folderName);
        const files = await fs.readdir(folderPath);
        const filePath = path.join(folderPath, files[0]);
        await ctx.deleteMessage(message.message_id);
        const videoStream = (await import("fs")).createReadStream(filePath);
        const sentMessage = await ctx.replyWithVideo(
          Input.fromReadableStream(videoStream)
        );
        stopVideoAction();
        stopVideoAction = null;

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
            mediaType: EMediaType.VIDEO,
            height: Number(height),
          });
        }
      } catch (error) {
        if (stopVideoAction) {
          stopVideoAction();
        }
        throw error;
      } finally {
        // Always delete the folder inside config.downloadDir, even if an error occurred
        await service.cleanupFolder();
      }
    }
  }

  return ctx.scene.leave();
};
