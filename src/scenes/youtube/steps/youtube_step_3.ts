import { MESSAGES } from "@/constants";
import { callbackQuery } from "telegraf/filters";
import path from "path";
import { Input } from "telegraf";
import { startContinuousAction } from "@/utils/continuousAction";
import { IMyContext } from "@/interfaces/IMyContext";
import { handleCancelButton } from "@/scenes/helpers";
import YoutubeDownload from "@/models/YoutubeDownload";
import { EPlatform } from "@/enums/EPlatform";
import { EMediaType } from "@/enums/EMediaType";
import { findAndSendMedia } from "@/helpers";
import { YoutubeService } from "@/services";
import {
  findMediaFile,
  getUploadableFileSize,
  VIDEO_EXTENSIONS,
} from "@/utils/downloadFolder";
import { createReadStream } from "fs";

export const youtubeStep3 = async (ctx: IMyContext) => {
  if (ctx.has(callbackQuery("data"))) {
    await ctx.answerCbQuery();

    const data = ctx.callbackQuery.data;

    if (await handleCancelButton(ctx, data)) return;

    const height = data;

    await ctx.deleteMessage();

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
      height: Number(height),
      mediaType: EMediaType.VIDEO,
    });

    if (!result) {
      const message = await ctx.sendMessage(MESSAGES.INFO.DOWNLOADING_VIDEO);

      let stopVideoAction: (() => void) | null = null;
      try {
        const folderName = await service.downloadVideo(height);
        stopVideoAction = startContinuousAction(ctx, "upload_video");
        const filePath = await findMediaFile(folderName, VIDEO_EXTENSIONS);
        const fileSize = await getUploadableFileSize(filePath);
        await ctx.deleteMessage(message.message_id);
        const thumbnailUrl = service.data?.thumbnail;
        const sentMessage = await ctx.replyWithVideo(
          Input.fromReadableStream(createReadStream(filePath)),
          {
            thumbnail: thumbnailUrl
              ? Input.fromURLStream(thumbnailUrl)
              : undefined,
          }
        );
        stopVideoAction();
        stopVideoAction = null;

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
            mediaType: EMediaType.VIDEO,
            height: Number(height),
          });
        }
      } catch (error) {
        await ctx.deleteMessage(message.message_id).catch(() => {});
        throw error;
      } finally {
        stopVideoAction?.();
        await service.cleanupFolder();
      }
    }
  }

  return ctx.scene.leave();
};
