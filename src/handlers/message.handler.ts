import logger from "../config/logger";
import { startContinuousAction } from "../utils/continuousAction";
import { getUserErrorMessage, UserError } from "@/utils/errors";
import { MESSAGES } from "@/constants";
import { IMyContext } from "@/interfaces/IMyContext";
import { handlePlatform } from "@/middleware/handlePlatform";

/**
 * Handle text messages from users
 */
export const handleTextMessage = async (ctx: IMyContext): Promise<void> => {
  const stopTyping = startContinuousAction(ctx, "typing");

  try {
    const user = ctx.from;

    if (!user) {
      throw new UserError(MESSAGES.ERROR.USER_NOT_FOUND);
    }

    await handlePlatform(ctx);
  } catch (error) {
    logger.error("Error handling text message", {
      error,
      userId: ctx.from?.id,
    });
    await ctx.reply(getUserErrorMessage(error));
    return;
  } finally {
    stopTyping();
  }
};
