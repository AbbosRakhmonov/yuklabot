import { IMyContext } from "@/interfaces/IMyContext";
import { callbackQuery } from "telegraf/filters";
import { handleCancelButton } from "@/scenes/helpers";
import { EMediaType } from "@/enums/EMediaType";
import { instagramStep3 } from "@/scenes/instagram/steps/instagram_step_3";
import { instagramStep4 } from "@/scenes/instagram/steps/instagram_step_4";

export const instagramStep2 = async (ctx: IMyContext) => {
  if (ctx.has(callbackQuery("data"))) {
    await ctx.answerCbQuery();
    const type = ctx.callbackQuery.data;

    // Check if cancel button was clicked
    await handleCancelButton(ctx, type);

    await ctx.deleteMessage();

    switch (type) {
      case EMediaType.VIDEO:
        return await instagramStep3(ctx);
      case EMediaType.AUDIO:
        return await instagramStep4(ctx);
      default:
        break;
    }
  }

  return ctx.scene.leave();
};
