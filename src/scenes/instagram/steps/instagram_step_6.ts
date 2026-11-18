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
  const service = ctx.wizard.state.instagram.service;
  const data = ctx.wizard.state.instagram.data;

  // Check if image already exists in database
  const result = await findAndSendMedia(ctx, InstagramDownload, {
    url: service.url,
    platform: EPlatform.INSTAGRAM,
    mediaType: EMediaType.IMAGE,
  });

  // If media not found, send it and save to database
  if (!result) {
    if (data.image_url) {
      const stopAction = startContinuousAction(ctx, "upload_photo");
      try {
        const imageUrl = data.image_url;
        // By URL (Telegram fetches it); streamed through us if that fails
        const sentMessage = await withNetworkRetry(() =>
          sendWithCdnFallback(imageUrl, service.proxyId, "photo.jpg", (media) =>
            ctx.replyWithPhoto(media)
          )
        );

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
  }

  return ctx.scene.leave();
};

