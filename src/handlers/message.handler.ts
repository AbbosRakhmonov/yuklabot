import logger from "../config/logger";
import {
  startContinuousAction,
  stopContinuousAction,
} from "../utils/continuousAction";
import { MESSAGES } from "@/constants";
import { IMyContext } from "@/interfaces/IMyContext";
import { handlePlatform } from "@/middleware/handlePlatform";

/**
 * Handle text messages from users
 */
export const handleTextMessage = async (ctx: IMyContext): Promise<void> => {
  startContinuousAction(ctx, "typing");

  try {
    const user = ctx.from;

    if (!user) {
      throw new Error(MESSAGES.ERROR.USER_NOT_FOUND);
    }

    await handlePlatform(ctx);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : MESSAGES.ERROR.GENERIC;
    logger.error("Error handling text message", {
      error: errorMessage,
      userId: ctx.from?.id,
    });
    await ctx.reply(errorMessage);
    return;
  } finally {
    stopContinuousAction(ctx);
  }
};
