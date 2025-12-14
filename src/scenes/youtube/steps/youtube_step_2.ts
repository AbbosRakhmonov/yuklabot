import { MESSAGES, } from "@/constants";
import { EMediaType } from "@/enums/EMediaType";
import { IYoutubeFormat } from "@/interfaces/IYoutubeData";
import { TYoutubeSceneContext } from "@/scenes/youtube/types/TYoutubeSceneContext";
import { YoutubeService } from "@/services";
import { Markup } from "telegraf";
import { callbackQuery } from "telegraf/filters";

export const youtubeStep2 = async (ctx: TYoutubeSceneContext) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText(MESSAGES.INFO.ANALYZING);

  const url = ctx.scene.session.url;

  const service = new YoutubeService(url);

  if (ctx.has(callbackQuery("data"))) {
    let formats: IYoutubeFormat[] = [];

    const type = ctx.callbackQuery.data;

    switch (type) {
      case EMediaType.VIDEO:
        await service.getInfo(['-j']);
        formats = service.getVideoFormats();
        break;
      case EMediaType.AUDIO:
        await service.getInfo([`-f`, 'ba']);
        formats = service.getAudioFormats();
        break;
    }


    const keyboard = Markup.inlineKeyboard(formats.map((f) => [Markup.button.callback(`🎥 ${f.format_note}`, f.height?.toString() ?? "")]));

    await ctx.deleteMessage();

    // send with thumbnail and title and duration
    await ctx.replyWithPhoto(service.data?.thumbnail ?? "", {
      caption: `📺 ${service.data?.title} - ${service.data?.duration_string}\n\n${MESSAGES.INFO.VIDEO_QUALITY}`,
      ...keyboard,
    });

    ctx.scene.session.service = service;

    return ctx.wizard.next();
  }

  return ctx.scene.leave();
};
