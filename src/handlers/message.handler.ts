import { Context } from "telegraf";
import { isValidUrl } from "../helpers/isValidUrl";
import logger from "../config/logger";
import {
  startContinuousAction,
  stopContinuousAction,
} from "../utils/continuousAction";
import { MESSAGES } from "@/constants";
import { getPlatformByUrl } from "@/helpers";

/**
 * Handle text messages from users
 */
export const handleTextMessage = async (ctx: Context): Promise<void> => {
  // Start continuous typing action
  startContinuousAction(ctx, "typing");

  try {
    const user = ctx.from;
    const message = ctx.message;

    if (!user || !message || !("text" in message) || !message?.text?.trim()) {
      throw new Error(MESSAGES.ERROR.INVALID_MESSAGE);
    }

    const text = message.text.trim();

    if (!isValidUrl(text)) {
      throw new Error(MESSAGES.ERROR.INVALID_URL);
    }

    logger.info("Text message received", { text, userId: ctx.from?.id });

    await ctx.reply(`📝 Xabaringiz qabul qilindi! ✅`);

    await getPlatformByUrl(text);
    // start scense by platform
    throw new Error(MESSAGES.ERROR.UNSUPPORTED_PLATFORM);
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
