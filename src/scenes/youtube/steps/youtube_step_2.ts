import { MESSAGES } from "@/constants";
import { EMediaType } from "@/enums/EMediaType";
import { IYoutubeFormat } from "@/interfaces/IYoutubeData";
import { TYoutubeSceneContext } from "@/scenes/youtube/types/TYoutubeSceneContext";
import { YoutubeService } from "@/services";
import { Markup } from "telegraf";
import { callbackQuery } from "telegraf/filters";
import { CANCEL_BUTTON_CALLBACK } from "@/scenes/youtube/constants";
import { youtubeStep4 } from "@/scenes/youtube/steps/youtube_step_4";

export const youtubeStep2 = async (ctx: TYoutubeSceneContext) => {
  if (ctx.has(callbackQuery("data"))) {
    await ctx.answerCbQuery();

    const type = ctx.callbackQuery.data;

    // Handle cancel button
    if (type === CANCEL_BUTTON_CALLBACK) {
      await ctx.editMessageText(MESSAGES.INFO.SCENE_CANCELLED);
      return ctx.scene.leave();
    }

    await ctx.editMessageText(MESSAGES.INFO.ANALYZING);

    const url = ctx.scene.session.url;

    const service = new YoutubeService(url);
    ctx.scene.session.service = service;

    let formats: IYoutubeFormat[] = [];

    switch (type) {
      case EMediaType.VIDEO:
        await service.getInfo(["-j"]);
        formats = service.getVideoFormats();
        break;
      case EMediaType.AUDIO:
        await ctx.deleteMessage();
        return await youtubeStep4(ctx);
      default:
        return ctx.scene.leave();
    }

    const formatButtons = formats.map((f) => [
      Markup.button.callback(`🎥 ${f.format_note}`, f.height?.toString() ?? ""),
    ]);
    const cancelButton = [
      Markup.button.callback("❌ Bekor qilish", CANCEL_BUTTON_CALLBACK),
    ];
    const keyboard = Markup.inlineKeyboard([...formatButtons, cancelButton]);

    await ctx.deleteMessage();

    // send with thumbnail and title and duration
    await ctx.replyWithPhoto(service.data?.thumbnail ?? "", {
      caption: `📺 ${service.data?.title} - ${service.data?.duration_string}\n\n${MESSAGES.INFO.VIDEO_QUALITY}`,
      ...keyboard,
    });

    return ctx.wizard.next();
  }

  return ctx.scene.leave();
};
