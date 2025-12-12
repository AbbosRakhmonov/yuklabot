import { MESSAGES } from "@/constants";
import { EMediaType } from "@/enums/EMediaType";
import { TYoutubeSceneContext } from "@/scenes/youtube/types/TYoutubeSceneContext";
import { YoutubeService } from "@/services";
import { callbackQuery } from "telegraf/filters";

export const youtubeStep2 = async (ctx: TYoutubeSceneContext) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText(MESSAGES.INFO.DOWNLOADING_VIDEO);

  const url = ctx.scene.session.url;

  const service = new YoutubeService(url);

  const data = await service.getVideoInfo();
  console.log(data);

  if (ctx.has(callbackQuery("data"))) {
    const type = ctx.callbackQuery.data;

    switch (type) {
      case EMediaType.VIDEO:
        await ctx.reply(MESSAGES.SUCCESS.OPERATION_COMPLETE);
        break;
      case EMediaType.AUDIO:
        await ctx.reply(MESSAGES.SUCCESS.OPERATION_COMPLETE);
        break;
    }
  }

  ctx.scene.leave();
};
