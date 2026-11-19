import { sharedDownload } from "@/helpers/sharedDownload";
import { deliveryConfirmed, deliveryStage, observeAttempt } from "@/utils/deliveryAttempt";
import { UserError } from "@/utils/errors";
import { MESSAGES } from "@/constants";
import { IMyContext } from "@/interfaces/IMyContext";
import { sendWithCdnFallback } from "@/utils/cdnInput";
import { startContinuousAction } from "@/utils/continuousAction";
import InstagramDownload from "@/models/InstagramDownload";
import { EPlatform } from "@/enums/EPlatform";
import { EMediaType } from "@/enums/EMediaType";
import {
  findAndSendMedia,
  getMessageFileId,
  withNetworkRetry,
} from "@/helpers";

export const instagramStep6 = async (ctx: IMyContext) => {
  const { service } = ctx.wizard.state.instagram;
  await observeAttempt(ctx, EPlatform.INSTAGRAM, "source", () => sharedDownload(ctx,
    [EPlatform.INSTAGRAM, service.url, EMediaType.IMAGE],
    preferFileId => findAndSendMedia(ctx, InstagramDownload, {
      url: service.url, platform: EPlatform.INSTAGRAM, mediaType: EMediaType.IMAGE,
    }, { preferFileId }),
    () => uploadPhoto(ctx),
  ));
  return ctx.scene.leave();
};

async function uploadPhoto(ctx: IMyContext) {
  const { service, data } = ctx.wizard.state.instagram;
  if (!data.image_url) throw new UserError(MESSAGES.ERROR.MEDIA_NOT_FOUND);
  deliveryStage("telegram");
  const stopAction = startContinuousAction(ctx, "upload_photo");
  try {
    const imageUrl = data.image_url;
    // By URL (Telegram fetches it); streamed through us if that fails
    const sentMessage = await withNetworkRetry(() =>
      sendWithCdnFallback(imageUrl, service.proxyId, "photo.jpg", (media) =>
        ctx.replyWithPhoto(media)
      )
    );

    deliveryConfirmed();
    if (ctx.userMongoId) {
      await InstagramDownload.create({
        user: ctx.userMongoId,
        url: service.url,
        chatId: ctx.chat?.id || ctx.from?.id || 0,
        messageId: sentMessage.message_id,
        fileId: getMessageFileId(sentMessage),
        platform: EPlatform.INSTAGRAM,
        fileName: data.title || data.shortcode || "instagram_image",
        fileSize: 0,
        mediaType: EMediaType.IMAGE,
      });
    }
  } finally {
    stopAction();
  }
}
