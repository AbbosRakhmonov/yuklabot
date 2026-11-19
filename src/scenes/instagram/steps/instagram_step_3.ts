import { IMyContext } from "@/interfaces/IMyContext";
import { callbackQuery } from "telegraf/filters";
import { startContinuousAction } from "@/utils/continuousAction";
import InstagramDownload from "@/models/InstagramDownload";
import { EPlatform } from "@/enums/EPlatform";
import { EMediaType } from "@/enums/EMediaType";
import {
  findAndSendMedia,
  getMessageFileId,
  withNetworkRetry,
} from "@/helpers";
import { destroyInput, openCdnStream } from "@/utils/cdnInput";
import { activeTasks } from "@/utils/activeTasks";

/**
 * Sends the video (from the DB cache if it was sent before), streamed from
 * the CDN straight to Telegram, nothing on disk
 */
export const sendInstagramVideo = async (ctx: IMyContext) => {
  const service = ctx.wizard.state.instagram.service;
  const data = ctx.wizard.state.instagram.data;

  const result = await findAndSendMedia(ctx, InstagramDownload, {
    url: service.url,
    platform: EPlatform.INSTAGRAM,
    mediaType: EMediaType.VIDEO,
  });
  if (result) return;

  const monitorTask = activeTasks.startTask({
    userId: ctx.from?.id ?? 0,
    username: ctx.from?.username,
    firstName: ctx.from?.first_name,
    platform: EPlatform.INSTAGRAM,
    mediaType: EMediaType.VIDEO,
    url: service.url,
    title: data?.title || "Instagram Video",
    quality: data?.is_story ? "Story" : "Reel",
  });

  const stopVideoAction = startContinuousAction(ctx, "upload_video");
  try {
    monitorTask.updateStage("uploading");
    const thumbnailUrl = data.thumbnail || data.image_url;
    const sentMessage = await withNetworkRetry(async () => {
      const video = await openCdnStream(
        data.video_url as string,
        service.proxyId,
        "video.mp4",
      );
      // The thumbnail is optional: a failed one never blocks the video
      const thumbnail = thumbnailUrl
        ? await openCdnStream(thumbnailUrl, service.proxyId, "thumb.jpg").catch(
            () => undefined,
          )
        : undefined;
      try {
        return await ctx.replyWithVideo(video, {
          thumbnail,
          width: data.width,
          height: data.height,
          supports_streaming: true,
        });
      } catch (error) {
        destroyInput(video);
        destroyInput(thumbnail);
        throw error;
      }
    });

    stopVideoAction();
    monitorTask.complete();

    if (ctx.userMongoId) {
      await InstagramDownload.create({
        user: ctx.userMongoId,
        url: service.url,
        chatId: ctx.chat?.id || ctx.from?.id || 0,
        messageId: sentMessage.message_id,
        fileId: getMessageFileId(sentMessage),
        platform: EPlatform.INSTAGRAM,
        fileName: data?.title ?? "",
        fileSize: 0,
        mediaType: EMediaType.VIDEO,
      });
    }
  } catch (error) {
    monitorTask.fail(error);
    stopVideoAction();
    throw error;
  }
};

/**
 * "Video" button pressed
 */
export const instagramStep3 = async (ctx: IMyContext) => {
  if (ctx.has(callbackQuery("data"))) {
    await ctx.answerCbQuery().catch(() => {});
    await sendInstagramVideo(ctx);
  }
  return ctx.scene.leave();
};
