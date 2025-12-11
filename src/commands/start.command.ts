import { Context } from "telegraf";
import { showBotAction } from "../utils/botActions";
import logger from "../config/logger";
import { Messages } from "../utils/messages";
import { MESSAGES } from "@/constants";

export const startCommand = async (ctx: Context): Promise<void> => {
  try {
    // Show typing action
    await showBotAction(ctx, "typing");

    const user = ctx.from;

    if (!user) {
      await ctx.reply(MESSAGES.ERROR.USER_NOT_FOUND);
      return;
    }

    // User activity is automatically tracked by userActivityMiddleware
    // No need to manually update user data here

    await ctx.reply(Messages.welcome(user.first_name));
  } catch (error) {
    logger.error("Error in start command", { error, userId: ctx.from?.id });
    await ctx.reply(MESSAGES.ERROR.GENERIC);
  }
};
