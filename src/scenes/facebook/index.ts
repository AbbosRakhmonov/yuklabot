import path from "path";
import { Scenes } from "telegraf";
import { IMyContext } from "@/interfaces/IMyContext";
import { IBaseState } from "@/interfaces/IBaseState";
import { MESSAGES } from "@/constants";
import { EPlatform } from "@/enums/EPlatform";
import { EMediaType } from "@/enums/EMediaType";
import FacebookDownload from "@/models/FacebookDownload";
import { FacebookService } from "@/services/facebook.service";
import { findAndSendMedia, sendVideoFile } from "@/helpers";
import { sharedDownload } from "@/helpers/sharedDownload";
import { observeAttempt } from "@/utils/deliveryAttempt";
import { ProgressMessage } from "@/utils/progressMessage";
import { startContinuousAction } from "@/utils/continuousAction";
import { buildCaption } from "@/utils/caption";
import { activeTasks } from "@/utils/activeTasks";
import { findMediaFile, VIDEO_EXTENSIONS } from "@/utils/downloadFolder";

export const FACEBOOK_SCENE_NAME = "facebook-downloader";
export type IFacebookState = IBaseState;

/**
 * Facebook Downloader Scene: public videos and reels, sent right away
 */
export const facebookScene = new Scenes.WizardScene<IMyContext>(
  FACEBOOK_SCENE_NAME,
  async (ctx) => {
    const service = new FacebookService(ctx.wizard.state.facebook.url);
    await observeAttempt(ctx, EPlatform.FACEBOOK, "source", () => sharedDownload(ctx,
      [EPlatform.FACEBOOK, service.url, EMediaType.VIDEO],
      preferFileId => findAndSendMedia(ctx, FacebookDownload, {
        url: service.url, platform: EPlatform.FACEBOOK, mediaType: EMediaType.VIDEO,
      }, { preferFileId }),
      () => downloadAndSend(ctx, service),
    ));
    return ctx.scene.leave();
  },
);

async function downloadAndSend(ctx: IMyContext, service: FacebookService): Promise<void> {
  const progress = await ProgressMessage.send(ctx, `📥 ${MESSAGES.INFO.DOWNLOADING_VIDEO}`);
  const monitorTask = activeTasks.startTask({
    userId: ctx.from?.id ?? 0,
    username: ctx.from?.username,
    firstName: ctx.from?.first_name,
    platform: EPlatform.FACEBOOK,
    mediaType: EMediaType.VIDEO,
    url: service.url,
    quality: "best",
    signal: progress.signal,
    onWait: progress.showQueue,
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
    const sent = await sendVideoFile(ctx, filePath, progress, {
      caption: buildCaption(ctx, service.data?.title, "📘"),
      width: service.data?.width,
      height: service.data?.height,
      duration: service.data?.duration,
      onStageChange: (stage) => monitorTask.updateStage(stage),
    });
    stopVideoAction();
    stopVideoAction = null;
    await progress.delete();
    monitorTask.complete();

    if (ctx.userMongoId) {
      await FacebookDownload.create({
        user: ctx.userMongoId,
        url: service.url,
        chatId: ctx.chat?.id || ctx.from?.id || 0,
        messageId: sent.messageId,
        fileId: sent.fileId,
        platform: EPlatform.FACEBOOK,
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
