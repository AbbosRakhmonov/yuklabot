import { sharedDownload } from "@/helpers/sharedDownload";
import { observeAttempt } from "@/utils/deliveryAttempt";
import { ProgressMessage } from "@/utils/progressMessage";
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
import { activeTasks } from "@/utils/activeTasks";

export const instagramStep4 = async (ctx: IMyContext) => {
  if (ctx.has(callbackQuery("data"))) {
    await ctx.answerCbQuery().catch(() => {});

    // The session keeps only the service's fields: rebuild it
    const serviceState = ctx.wizard.state.instagram.service;
    const service = new InstagramService(serviceState.url);
    service.data = ctx.wizard.state.instagram.data ?? serviceState.data;
    service.proxyId = serviceState.proxyId ?? null;

    await observeAttempt(ctx, EPlatform.INSTAGRAM, "source", () => sharedDownload(ctx,
      [EPlatform.INSTAGRAM, service.url, EMediaType.AUDIO],
      preferFileId => findAndSendMedia(ctx, InstagramDownload, {
        url: service.url, platform: EPlatform.INSTAGRAM, mediaType: EMediaType.AUDIO,
      }, { preferFileId }),
      () => extractAudio(ctx, service),
    ));
  }
  return ctx.scene.leave();
};

async function extractAudio(ctx: IMyContext, service: InstagramService) {
  const videoUrl = service.data?.video_url;
  if (!videoUrl) throw new UserError(MESSAGES.ERROR.MEDIA_NOT_FOUND);

  const progress = await ProgressMessage.send(ctx, MESSAGES.INFO.DOWNLOADING_AUDIO);
  const monitorTask = activeTasks.startTask({
    userId: ctx.from?.id ?? 0,
    username: ctx.from?.username,
    firstName: ctx.from?.first_name,
    platform: EPlatform.INSTAGRAM,
    mediaType: EMediaType.AUDIO,
    url: service.url,
    title: service.data?.title || "Instagram Audio",
    quality: "Audio",
    signal: progress.signal,
    onWait: progress.showQueue,
  });

  try {
    monitorTask.updateStage("downloading");
    const audioPath = await service.extractAudio(videoUrl, monitorTask.signal);
    const fileSize = await getUploadableFileSize(audioPath);
    await progress.delete();
    monitorTask.updateStage("uploading");
    const sentMessage = await ctx.replyWithAudio(
      toUploadInput(audioPath)
    );
    const fileName = path.basename(audioPath);
    monitorTask.complete();

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
    monitorTask.fail(error);
    await progress.delete().catch(() => {});
    throw error;
  } finally {
    await service.cleanupFolder();
  }
}
