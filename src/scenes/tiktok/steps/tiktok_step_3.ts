import { MESSAGES } from "@/constants";
import { IMyContext } from "@/interfaces/IMyContext";
import path from "path";
import { createReadStream } from "fs";
import { Input } from "telegraf";
import { startContinuousAction } from "@/utils/continuousAction";
import TiktokDownload from "@/models/TiktokDownload";
import { EPlatform } from "@/enums/EPlatform";
import { EMediaType } from "@/enums/EMediaType";
import { findAndSendMedia } from "@/helpers";
import { TiktokService } from "@/services/tiktok.service";
import {
  AUDIO_EXTENSIONS,
  findMediaFile,
  getUploadableFileSize,
  VIDEO_EXTENSIONS,
} from "@/utils/downloadFolder";

export const tiktokStep3 = async (
  ctx: IMyContext,
  mediaType: EMediaType = EMediaType.VIDEO
) => {
  // Get URL from state and service data
  const url = ctx.wizard.state.tiktok.url;
  const serviceState = ctx.wizard.state.tiktok.service;
  
  const service = new TiktokService(url);
  // Restore state data if available
  if (serviceState) {
    service.data = serviceState.data;
    service.folderName = serviceState.folderName;
  }

  // Try to find existing media in cache
  const result = await findAndSendMedia(ctx, TiktokDownload, {
    url: service.url,
    platform: EPlatform.TIKTOK,
    mediaType: mediaType,
  });

  if (!result) {
    if (mediaType === EMediaType.VIDEO) {
      await downloadAndSendVideo(ctx, service);
    } else {
      await downloadAndSendAudio(ctx, service);
    }
  }

  return ctx.scene.leave();
};

async function downloadAndSendVideo(
  ctx: IMyContext,
  service: TiktokService
): Promise<void> {
  const message = await ctx.sendMessage(MESSAGES.INFO.DOWNLOADING_VIDEO);

  let stopVideoAction: (() => void) | null = null;
  try {
    const folderName = await service.downloadVideo();
    stopVideoAction = startContinuousAction(ctx, "upload_video");

    const filePath = await findMediaFile(folderName, VIDEO_EXTENSIONS);
    const fileSize = await getUploadableFileSize(filePath);

    await ctx.deleteMessage(message.message_id);

    const videoStream = createReadStream(filePath);
    const sentMessage = await ctx.replyWithVideo(
      Input.fromReadableStream(videoStream),
      {
        thumbnail: service.data?.thumbnail
          ? Input.fromURLStream(service.data.thumbnail)
          : undefined,
        caption: service.data?.title
          ? `🎵 ${service.data.title.substring(0, 200)}`
          : undefined,
      }
    );

    stopVideoAction();
    stopVideoAction = null;

    const fileName = path.basename(filePath);

    // Create TiktokDownload record
    if (ctx.userMongoId) {
      await TiktokDownload.create({
        user: ctx.userMongoId,
        url: service.url,
        chatId: ctx.chat?.id || ctx.from?.id || 0,
        messageId: sentMessage.message_id,
        platform: EPlatform.TIKTOK,
        fileName: fileName,
        fileSize: fileSize,
        mediaType: EMediaType.VIDEO,
      });
    }
  } catch (error) {
    if (stopVideoAction) {
      stopVideoAction();
    }
    await ctx.deleteMessage(message.message_id).catch(() => {});
    throw error;
  } finally {
    await service.cleanupFolder();
  }
}

async function downloadAndSendAudio(
  ctx: IMyContext,
  service: TiktokService
): Promise<void> {
  const message = await ctx.sendMessage(MESSAGES.INFO.DOWNLOADING_AUDIO);

  let stopAudioAction: (() => void) | null = null;
  try {
    const folderName = await service.downloadAudio();
    stopAudioAction = startContinuousAction(ctx, "upload_voice");

    const filePath = await findMediaFile(folderName, AUDIO_EXTENSIONS);
    const fileSize = await getUploadableFileSize(filePath);

    await ctx.deleteMessage(message.message_id);

    const audioStream = createReadStream(filePath);
    const sentMessage = await ctx.replyWithAudio(
      Input.fromReadableStream(audioStream),
      {
        title: service.data?.title?.substring(0, 64) || "TikTok Audio",
        performer: service.data?.uploader || "TikTok",
      }
    );

    stopAudioAction();
    stopAudioAction = null;

    const fileName = path.basename(filePath);

    // Create TiktokDownload record
    if (ctx.userMongoId) {
      await TiktokDownload.create({
        user: ctx.userMongoId,
        url: service.url,
        chatId: ctx.chat?.id || ctx.from?.id || 0,
        messageId: sentMessage.message_id,
        platform: EPlatform.TIKTOK,
        fileName: fileName,
        fileSize: fileSize,
        mediaType: EMediaType.AUDIO,
      });
    }
  } catch (error) {
    if (stopAudioAction) {
      stopAudioAction();
    }
    await ctx.deleteMessage(message.message_id).catch(() => {});
    throw error;
  } finally {
    await service.cleanupFolder();
  }
}
