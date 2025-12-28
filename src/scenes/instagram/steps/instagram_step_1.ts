// src/scenes/instagram/steps/instagram_step_1.ts
import { MESSAGES } from "@/constants";
import { EMediaType } from "@/enums/EMediaType";
import { EPlatform } from "@/enums/EPlatform";
import { findAndSendMedia } from "@/helpers";
import { IMyContext } from "@/interfaces/IMyContext";
import InstagramDownload from "@/models/InstagramDownload";
import { instagramStep5 } from "@/scenes/instagram/steps/instagram_step_5";
import { instagramStep6 } from "@/scenes/instagram/steps/instagram_step_6";
import { InstagramService } from "@/services";
import { sendAudioVideoButtons } from "@/utils/sendAudioVideoButtons";

export const instagramStep1 = async (ctx: IMyContext) => {
  const url = ctx.wizard.state.instagram.url;

  const result = await findAndSendMedia(ctx, InstagramDownload, {
    user: ctx.userMongoId,
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
    ctx.wizard.state.instagram.galleryDlData = service.galleryDlData;
    ctx.wizard.state.instagram.galleryDlRawData = service.galleryDlRawData;

    await ctx.deleteMessage(message.message_id);

    const data = ctx.wizard.state.instagram.data;

    // Show Video/Audio buttons if media type supports audio extraction
    // Stories are converted to VIDEO or IMAGE, so we only check VIDEO and REEL
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
    await ctx.deleteMessage(message.message_id);
    const errorMessage =
      error instanceof Error ? error.message : MESSAGES.ERROR.GENERIC;
    await ctx.reply(errorMessage);
    return ctx.scene.leave();
  }
};
