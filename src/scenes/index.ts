import { Scenes } from "telegraf";
import { youtubeScene } from "./youtube";
import { MESSAGES } from "@/constants";
import logger from "@/config/logger";
import { startContinuousAction, stopContinuousAction } from "@/utils/continuousAction";
import { IMyContext } from "@/interfaces/IMyContext";

export const stage = new Scenes.Stage([youtubeScene]);

stage.use(async (ctx, next) => {
    try {
        startContinuousAction(ctx as IMyContext, "typing");
        await next();
    }
    catch (error) {
        await ctx.scene.leave();

        const errorMessage =
            error instanceof Error ? error.message : MESSAGES.ERROR.GENERIC;
        logger.error("Error handling text message", {
            error: errorMessage,
            userId: ctx.from?.id,
        });
        await ctx.reply(errorMessage);
    } finally {
        stopContinuousAction(ctx as IMyContext);
    }
})
