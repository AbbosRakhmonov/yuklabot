import { MESSAGES } from "@/constants";
import { EMediaType } from "@/enums/EMediaType";
import { IMyContext } from "@/interfaces/IMyContext";
import { TiktokService } from "@/services/tiktok.service";
import { callbackQuery } from "telegraf/filters";
import { handleCancelButton } from "@/scenes/helpers";
import { tiktokStep3 } from "@/scenes/tiktok/steps/tiktok_step_3";

export const tiktokStep2 = async (ctx: IMyContext) => {
  if (ctx.has(callbackQuery("data"))) {
    await ctx.answerCbQuery();
    const type = ctx.callbackQuery.data;

    await handleCancelButton(ctx, type);

    await ctx.editMessageText(MESSAGES.INFO.ANALYZING);

    const url = ctx.wizard.state.tiktok.url;

    const service = new TiktokService(url);
    ctx.wizard.state.tiktok.service = service;

    // Get video info
    await service.getInfo();

    switch (type) {
      case EMediaType.VIDEO:
        await ctx.deleteMessage();
        return await tiktokStep3(ctx, EMediaType.VIDEO);
      case EMediaType.AUDIO:
        await ctx.deleteMessage();
        return await tiktokStep3(ctx, EMediaType.AUDIO);
      default:
        return ctx.scene.leave();
    }
  }

  return ctx.scene.leave();
};
