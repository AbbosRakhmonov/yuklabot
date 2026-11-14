import { Scenes } from "telegraf";
import { youtubeScene } from "./youtube";
import { instagramScene } from "./instagram";
import { tiktokScene } from "./tiktok";
import { getUserErrorMessage } from "@/utils/errors";
import logger from "@/config/logger";
import { stopContinuousAction } from "@/utils/continuousAction";
import { IMyContext } from "@/interfaces/IMyContext";
import { message } from "telegraf/filters";
import { handlePlatform } from "@/middleware/handlePlatform";

export const stage = new Scenes.Stage([youtubeScene, instagramScene, tiktokScene]);

stage.use(async (ctx: IMyContext, next) => {
  try {
    if (ctx.has(message("text"))) {
      await ctx.scene.leave();
      await handlePlatform(ctx);
    } else {
      await next();
    }
  } catch (error) {
    // Stop any chat action left running by the failed step
    stopContinuousAction(ctx);
    await ctx.scene.leave();

    logger.error("Error in scene", {
      error,
      userId: ctx.from?.id,
    });
    await ctx.reply(getUserErrorMessage(error));
  }
});
