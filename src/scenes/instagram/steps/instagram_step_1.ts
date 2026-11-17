// src/scenes/instagram/steps/instagram_step_1.ts
import { MESSAGES } from "@/constants";
import { EMediaType } from "@/enums/EMediaType";
import { EPlatform } from "@/enums/EPlatform";
import { findAndSendMedia } from "@/helpers";
import { IMyContext } from "@/interfaces/IMyContext";
import InstagramDownload from "@/models/InstagramDownload";
import { sendInstagramVideo } from "@/scenes/instagram/steps/instagram_step_3";
import { instagramStep5 } from "@/scenes/instagram/steps/instagram_step_5";
import { instagramStep6 } from "@/scenes/instagram/steps/instagram_step_6";
import { InstagramService } from "@/services";
import { sendAudioVideoButtons } from "@/utils/sendAudioVideoButtons";
import { getUserErrorMessage } from "@/utils/errors";
import logger from "@/config/logger";

export const instagramStep1 = async (ctx: IMyContext) => {
  const url = ctx.wizard.state.instagram.url;

  const result = await findAndSendMedia(ctx, InstagramDownload, {
    url,
    platform: EPlatform.INSTAGRAM,
    mediaType: [EMediaType.POST, EMediaType.IMAGE], // Array for OR operation
  });

  if (result) return ctx.scene.leave();

  const message = await ctx.sendMessage(MESSAGES.INFO.ANALYZING);

  try {
    const service = new InstagramService(url);
    ctx.wizard.state.instagram.service = service;

    ctx.wizard.state.instagram.data = await service.getInfo();

    await ctx.deleteMessage(message.message_id);

    const data = ctx.wizard.state.instagram.data;

    // A story is sent right away as it is (photo or video), no buttons
    if (data.is_story && data.media_type === EMediaType.VIDEO) {
      await sendInstagramVideo(ctx);
      return ctx.scene.leave();
    }

    // Show Video/Audio buttons if media type supports audio extraction
    if (
      data.media_type === EMediaType.VIDEO ||
      data.media_type === EMediaType.REEL
    ) {
      await sendAudioVideoButtons(ctx);
      return ctx.wizard.next();
    } else if (data.media_type === EMediaType.IMAGE) {
      return await instagramStep6(ctx);
    } else {
      return await instagramStep5(ctx);
    }
  } catch (error) {
    await ctx.deleteMessage(message.message_id).catch(() => {});
    logger.error("Error getting Instagram info", {
      error,
      url,
      userId: ctx.from?.id,
    });
    await ctx.reply(getUserErrorMessage(error));
    return ctx.scene.leave();
  }
};
