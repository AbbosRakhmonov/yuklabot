import { MESSAGES } from "@/constants";
import { IMyContext } from "@/interfaces/IMyContext";
import path from "path";
import mongoose from "mongoose";
import fs from "fs/promises";
import { Markup } from "telegraf";
import { startContinuousAction } from "@/utils/continuousAction";
import { ProgressMessage } from "@/utils/progressMessage";
import { buildCaption } from "@/utils/caption";
import TiktokDownload from "@/models/TiktokDownload";
import { EPlatform } from "@/enums/EPlatform";
import { EMediaType } from "@/enums/EMediaType";
import {
  findAndSendMedia,
  getMessageFileId,
  sendAlbum,
  sendVideoFile,
} from "@/helpers";
import { ICarouselItem } from "@/interfaces/IInstagramDownload";
import {
  isUnsupportedPhotoPostError,
  TiktokService,
} from "@/services/tiktok.service";
import { TIKTOK_AUDIO_CALLBACK_PREFIX } from "@/scenes/tiktok/constants";
import {
  AUDIO_EXTENSIONS,
  findMediaFile,
  getUploadableFileSize,
  VIDEO_EXTENSIONS,
  toUploadInput,
} from "@/utils/downloadFolder";
import { UserError } from "@/utils/errors";
import { activeTasks } from "@/utils/activeTasks";

const audioButton = (downloadId: string) =>
  Markup.inlineKeyboard([
    Markup.button.callback(
      "🎵 Audio",
      `${TIKTOK_AUDIO_CALLBACK_PREFIX}${downloadId}`
    ),
  ]).reply_markup;

const roundDuration = (duration?: number) =>
  duration ? Math.round(duration) : undefined;

const getChatId = (ctx: IMyContext) => ctx.chat?.id || ctx.from?.id || 0;

/**
 * Sends a TikTok post (from cache or freshly downloaded):
 * a video with a "🎵 Audio" button, or the images + music of a photo post
 */
export async function sendTiktokPost(
  ctx: IMyContext,
  url: string
): Promise<void> {
  const service = new TiktokService(url);

  const cached = await findAndSendMedia(
    ctx,
    TiktokDownload,
    {
      url: service.url,
      platform: EPlatform.TIKTOK,
      mediaType: [EMediaType.VIDEO, EMediaType.POST],
    },
    { replyMarkup: audioButton }
  );
  if (cached) return;

  if (service.isPhotoPost()) {
    return sendTiktokPhotos(ctx, service);
  }

  try {
    await sendTiktokVideo(ctx, service);
  } catch (error) {
    // A short link (vm.tiktok.com) can turn out to be a photo post
    if (!isUnsupportedPhotoPostError(error)) throw error;
    await sendTiktokPhotos(ctx, service);
  }
}

async function sendTiktokVideo(
  ctx: IMyContext,
  service: TiktokService
): Promise<void> {
  const progress = await ProgressMessage.send(
    ctx,
    `📥 ${MESSAGES.INFO.DOWNLOADING_VIDEO}`
  );

  const monitorTask = activeTasks.startTask({
    userId: ctx.from?.id ?? 0,
    username: ctx.from?.username,
    firstName: ctx.from?.first_name,
    platform: EPlatform.TIKTOK,
    mediaType: EMediaType.VIDEO,
    url: service.url,
    title: service.data?.title,
    quality: "HD",
    signal: progress.signal,
  });

  let stopVideoAction: (() => void) | null = null;
  try {
    monitorTask.updateStage("downloading");
    const folderName = await service.downloadVideo({
      onProgress: (p) => {
        progress.update(p);
        monitorTask.updateProgress(p);
      },
      signal: monitorTask.signal,
    });
    stopVideoAction = startContinuousAction(ctx, "upload_video");

    const filePath = await findMediaFile(folderName, VIDEO_EXTENSIONS);

    monitorTask.updateStage("uploading");
    // The record id is known before sending, so the button can point to it.
    // Without a user record nothing is saved, so the button would be dead.
    const downloadId = new mongoose.Types.ObjectId();
    // Over Telegram's limit it comes in parts, never re-encoded
    const sent = await sendVideoFile(ctx, filePath, progress, {
      caption: buildCaption(ctx, service.data?.title, "🎵"),
      width: service.data?.width,
      height: service.data?.height,
      duration: service.data?.duration,
      replyMarkup: ctx.userMongoId
        ? audioButton(String(downloadId))
        : undefined,
      onStageChange: (stage) => monitorTask.updateStage(stage),
    });

    stopVideoAction();
    stopVideoAction = null;
    await progress.delete();
    monitorTask.complete();

    if (ctx.userMongoId) {
      await TiktokDownload.create({
        _id: downloadId,
        user: ctx.userMongoId,
        url: service.url,
        chatId: getChatId(ctx),
        messageId: sent.messageId,
        fileId: sent.fileId,
        platform: EPlatform.TIKTOK,
        fileName: path.basename(filePath),
        fileSize: sent.totalSize,
        mediaType: EMediaType.VIDEO,
        carousel: sent.parts,
      });
    }
  } catch (error) {
    monitorTask.fail(error);
    await progress.delete();
    throw error;
  } finally {
    stopVideoAction?.();
    await service.cleanupFolder();
  }
}

/**
 * Photo post (slideshow): images as albums, then the music
 */
async function sendTiktokPhotos(
  ctx: IMyContext,
  service: TiktokService
): Promise<void> {
  const progress = await ProgressMessage.send(
    ctx,
    `🖼 ${MESSAGES.INFO.DOWNLOADING_IMAGE}`
  );

  const monitorTask = activeTasks.startTask({
    userId: ctx.from?.id ?? 0,
    username: ctx.from?.username,
    firstName: ctx.from?.first_name,
    platform: EPlatform.TIKTOK,
    mediaType: EMediaType.POST,
    url: service.url,
    title: "TikTok Slideshow",
    quality: "Photos",
    signal: progress.signal,
  });

  let stopPhotoAction: (() => void) | null = null;
  try {
    monitorTask.updateStage("downloading");
    const post = await service.downloadPhotos({ signal: monitorTask.signal });
    if (post.images.length === 0) {
      throw new UserError(MESSAGES.ERROR.MEDIA_NOT_FOUND);
    }
    if (post.description) monitorTask.setTitle(post.description);
    stopPhotoAction = startContinuousAction(ctx, "upload_photo");
    await progress.setText(MESSAGES.INFO.UPLOADING);
    monitorTask.updateStage("uploading");

    const items: ICarouselItem[] = await sendAlbum(
      ctx,
      post.images.map((image, i) => ({
        type: "photo" as const,
        media: () => toUploadInput(image),
        itemId: String(i + 1),
      })),
      buildCaption(ctx, post.description, "🖼")
    );

    if (post.audio) {
      const audioPath = post.audio;
      const audioMessage = await ctx.replyWithAudio(
        toUploadInput(audioPath),
        {
          title: post.musicTitle?.substring(0, 64),
          performer: post.author?.substring(0, 64),
        }
      );
      items.push({
        messageId: audioMessage.message_id,
        itemId: "audio",
        mediaType: EMediaType.AUDIO,
      });
    }

    stopPhotoAction();
    stopPhotoAction = null;
    await progress.delete();
    monitorTask.complete();

    if (ctx.userMongoId && items.length > 0) {
      const sizes = await Promise.all(
        [...post.images, ...(post.audio ? [post.audio] : [])].map((file) =>
          fs.stat(file).then((s) => s.size, () => 0)
        )
      );
      await TiktokDownload.create({
        user: ctx.userMongoId,
        url: service.url,
        chatId: getChatId(ctx),
        messageId: items[0].messageId,
        platform: EPlatform.TIKTOK,
        fileName: post.description?.substring(0, 100) || "tiktok_photo",
        fileSize: sizes.reduce((a, b) => a + b, 0),
        mediaType: EMediaType.POST,
        carousel: items,
      });
    }
  } catch (error) {
    monitorTask.fail(error);
    await progress.delete();
    throw error;
  } finally {
    stopPhotoAction?.();
    await service.cleanupFolder();
  }
}

/**
 * Sends the audio of a TikTok video (from cache or freshly downloaded),
 * as a reply to the video message when given
 */
export async function sendTiktokAudio(
  ctx: IMyContext,
  url: string,
  replyToMessageId?: number
): Promise<void> {
  const service = new TiktokService(url);

  const cached = await findAndSendMedia(
    ctx,
    TiktokDownload,
    { url: service.url, platform: EPlatform.TIKTOK, mediaType: EMediaType.AUDIO },
    { replyToMessageId }
  );
  if (cached) return;

  const progress = await ProgressMessage.send(
    ctx,
    `🎵 ${MESSAGES.INFO.DOWNLOADING_AUDIO}`
  );

  const monitorTask = activeTasks.startTask({
    userId: ctx.from?.id ?? 0,
    username: ctx.from?.username,
    firstName: ctx.from?.first_name,
    platform: EPlatform.TIKTOK,
    mediaType: EMediaType.AUDIO,
    url: service.url,
    title: service.data?.title,
    quality: "Audio",
    signal: progress.signal,
  });

  let stopAudioAction: (() => void) | null = null;
  try {
    monitorTask.updateStage("downloading");
    const folderName = await service.downloadAudio({
      onProgress: (p) => {
        progress.update(p);
        monitorTask.updateProgress(p);
      },
      signal: monitorTask.signal,
    });
    stopAudioAction = startContinuousAction(ctx, "upload_voice");

    const filePath = await findMediaFile(folderName, AUDIO_EXTENSIONS);
    const fileSize = await getUploadableFileSize(filePath);
    await progress.setText(MESSAGES.INFO.UPLOADING);
    monitorTask.updateStage("uploading");

    const sentMessage = await ctx.replyWithAudio(
      toUploadInput(filePath),
      {
        caption: buildCaption(ctx, null),
        title: service.data?.title?.substring(0, 64) || "TikTok Audio",
        performer: service.data?.uploader || "TikTok",
        duration: roundDuration(service.data?.duration),
        reply_parameters: replyToMessageId
          ? { message_id: replyToMessageId, allow_sending_without_reply: true }
          : undefined,
      }
    );

    stopAudioAction();
    stopAudioAction = null;
    await progress.delete();
    monitorTask.complete();

    if (ctx.userMongoId) {
      await TiktokDownload.create({
        user: ctx.userMongoId,
        url: service.url,
        chatId: getChatId(ctx),
        messageId: sentMessage.message_id,
        fileId: getMessageFileId(sentMessage),
        platform: EPlatform.TIKTOK,
        fileName: path.basename(filePath),
        fileSize,
        mediaType: EMediaType.AUDIO,
      });
    }
  } catch (error) {
    monitorTask.fail(error);
    await progress.delete();
    throw error;
  } finally {
    stopAudioAction?.();
    await service.cleanupFolder();
  }
}
