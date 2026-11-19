import { MAX_FILE_SIZE_LABEL, MESSAGES } from "@/constants";
import { callbackQuery } from "telegraf/filters";
import path from "path";
import { Input } from "telegraf";
import { startContinuousAction } from "@/utils/continuousAction";
import { ProgressMessage } from "@/utils/progressMessage";
import { buildCaption } from "@/utils/caption";
import { IMyContext } from "@/interfaces/IMyContext";
import { handleCancelButton } from "@/scenes/helpers";
import YoutubeDownload from "@/models/YoutubeDownload";
import { EPlatform } from "@/enums/EPlatform";
import { EMediaType } from "@/enums/EMediaType";
import {
  findAndSendMedia,
  getMessageFileId,
  sendVideoFile,
} from "@/helpers";
import { YoutubeService } from "@/services";
import {
  AUDIO_OPTION_PREFIX,
  TOO_LARGE_OPTION_CALLBACK,
  TOO_MANY_PARTS_CALLBACK,
} from "@/scenes/youtube/constants";
import { config } from "@/config/config";
import { activeTasks } from "@/utils/activeTasks";
import {
  AUDIO_EXTENSIONS,
  findMediaFile,
  getUploadableFileSize,
  toUploadInput,
  VIDEO_EXTENSIONS,
} from "@/utils/downloadFolder";

/**
 * Handles the choice from the quality menu: a video height ("720")
 * or an audio format ("a:140")
 */
export const youtubeStep3 = async (ctx: IMyContext) => {
  if (!ctx.has(callbackQuery("data"))) return ctx.scene.leave();

  // 🚫 quality: explain and keep the menu (and its saved info) as is
  if (ctx.callbackQuery.data === TOO_LARGE_OPTION_CALLBACK) {
    await ctx.answerCbQuery(
      MESSAGES.ERROR.QUALITY_TOO_LARGE(MAX_FILE_SIZE_LABEL),
      { show_alert: true }
    );
    return;
  }
  if (ctx.callbackQuery.data === TOO_MANY_PARTS_CALLBACK) {
    await ctx.answerCbQuery(
      MESSAGES.ERROR.VIDEO_TOO_MANY_PARTS(config.maxVideoParts),
      { show_alert: true }
    );
    return;
  }

  await ctx.answerCbQuery();

  // Restore the service from the scene state (it holds the info JSON folder)
  const service = YoutubeService.fromState(ctx.wizard.state.youtube.service);

  try {
    const choice = ctx.callbackQuery.data;
    if (await handleCancelButton(ctx, choice)) return;

    await ctx.deleteMessage();

    if (choice.startsWith(AUDIO_OPTION_PREFIX)) {
      const formatId = choice.slice(AUDIO_OPTION_PREFIX.length);
      const cached = await findAndSendMedia(ctx, YoutubeDownload, {
        url: service.url,
        platform: EPlatform.YOUTUBE,
        mediaType: EMediaType.AUDIO,
        formatId,
      });
      if (!cached) await downloadAndSendAudio(ctx, service, formatId);
    } else {
      const cached = await findAndSendMedia(ctx, YoutubeDownload, {
        url: service.url,
        platform: EPlatform.YOUTUBE,
        height: Number(choice),
        mediaType: EMediaType.VIDEO,
      });
      if (!cached) await downloadAndSendVideo(ctx, service, choice);
    }

    return ctx.scene.leave();
  } finally {
    // Also removes the saved info JSON when cancelled or served from cache
    await service.cleanupFolder();
  }
};

async function downloadAndSendVideo(
  ctx: IMyContext,
  service: YoutubeService,
  height: string
): Promise<void> {
  const progress = await ProgressMessage.send(
    ctx,
    `📥 ${MESSAGES.INFO.DOWNLOADING_VIDEO}`
  );

  const monitorTask = activeTasks.startTask({
    userId: ctx.from?.id ?? 0,
    username: ctx.from?.username,
    firstName: ctx.from?.first_name,
    platform: EPlatform.YOUTUBE,
    mediaType: EMediaType.VIDEO,
    url: service.url,
    title: service.data?.title,
    quality: `${height}p`,
    signal: progress.signal,
  });

  let stopVideoAction: (() => void) | null = null;
  try {
    monitorTask.updateStage("downloading");
    const folderName = await service.downloadVideo(height, {
      onProgress: (p) => {
        progress.update(p);
        monitorTask.updateProgress(p);
      },
      signal: monitorTask.signal,
    });
    stopVideoAction = startContinuousAction(ctx, "upload_video");
    const filePath = await findMediaFile(folderName, VIDEO_EXTENSIONS);

    monitorTask.updateStage("uploading");
    // Over Telegram's limit it comes in parts, never re-encoded
    const thumbnailUrl = service.data?.thumbnail;
    const sent = await sendVideoFile(ctx, filePath, progress, {
      caption: buildCaption(ctx, service.data?.title, "📺"),
      thumbnail: thumbnailUrl
        ? () => Input.fromURLStream(thumbnailUrl)
        : undefined,
      width: service.getVideoWidth(Number(height)),
      height: Number(height),
      duration: service.data?.duration,
      onStageChange: (stage) => monitorTask.updateStage(stage),
    });
    stopVideoAction();
    stopVideoAction = null;
    await progress.delete();
    monitorTask.complete();

    if (ctx.userMongoId) {
      await YoutubeDownload.create({
        user: ctx.userMongoId,
        url: service.url,
        chatId: ctx.chat?.id || ctx.from?.id || 0,
        messageId: sent.messageId,
        fileId: sent.fileId,
        platform: EPlatform.YOUTUBE,
        fileName: path.basename(filePath),
        fileSize: sent.totalSize,
        mediaType: EMediaType.VIDEO,
        height: Number(height),
        carousel: sent.parts,
      });
    }
  } catch (error) {
    monitorTask.fail(error);
    await progress.delete();
    throw error;
  } finally {
    stopVideoAction?.();
  }
}

async function downloadAndSendAudio(
  ctx: IMyContext,
  service: YoutubeService,
  formatId: string
): Promise<void> {
  const progress = await ProgressMessage.send(
    ctx,
    `🎵 ${MESSAGES.INFO.DOWNLOADING_AUDIO}`
  );

  const monitorTask = activeTasks.startTask({
    userId: ctx.from?.id ?? 0,
    username: ctx.from?.username,
    firstName: ctx.from?.first_name,
    platform: EPlatform.YOUTUBE,
    mediaType: EMediaType.AUDIO,
    url: service.url,
    title: service.data?.title,
    quality: formatId,
    signal: progress.signal,
  });

  let stopAudioAction: (() => void) | null = null;
  try {
    monitorTask.updateStage("downloading");
    const folderName = await service.downloadAudio(formatId, {
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

    const data = service.data;
    const sentMessage = await ctx.replyWithAudio(toUploadInput(filePath), {
      caption: buildCaption(ctx, null),
      title: data?.title?.substring(0, 64),
      performer: (data?.channel || data?.uploader)?.substring(0, 64),
      duration: data?.duration ? Math.round(data.duration) : undefined,
    });
    stopAudioAction();
    stopAudioAction = null;
    await progress.delete();
    monitorTask.complete();

    if (ctx.userMongoId) {
      await YoutubeDownload.create({
        user: ctx.userMongoId,
        url: service.url,
        chatId: ctx.chat?.id || ctx.from?.id || 0,
        messageId: sentMessage.message_id,
        fileId: getMessageFileId(sentMessage),
        platform: EPlatform.YOUTUBE,
        fileName: path.basename(filePath),
        fileSize,
        mediaType: EMediaType.AUDIO,
        height: 0,
        formatId,
      });
    }
  } catch (error) {
    monitorTask.fail(error);
    await progress.delete();
    throw error;
  } finally {
    stopAudioAction?.();
  }
}
