import { Scenes } from "telegraf";
import { youtubeScene } from "./youtube";
import { instagramScene } from "./instagram";
import { tiktokScene } from "./tiktok";
import { MESSAGES } from "@/constants";
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
    await ctx.scene.leave();

    const errorMessage =
      error instanceof Error ? error.message : MESSAGES.ERROR.GENERIC;
    logger.error("Error in scene", {
      error: errorMessage,
      userId: ctx.from?.id,
    });
    await ctx.reply(errorMessage);
  } finally {
    stopContinuousAction(ctx);
  }
});
