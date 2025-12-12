import { isValidUrl } from "../helpers/isValidUrl";
import logger from "../config/logger";
import {
  startContinuousAction,
  stopContinuousAction,
} from "../utils/continuousAction";
import { MESSAGES } from "@/constants";
import { getPlatformByUrl } from "@/helpers";
import { IMyContext } from "@/interfaces/IMyContext";
import { EPlatform } from "@/enums/EPlatform";
import { YOUTUBE_SCENE_NAME } from "@/scenes/youtube/constants";

/**
 * Handle text messages from users
 */
export const handleTextMessage = async (ctx: IMyContext): Promise<void> => {
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

    const platform = await getPlatformByUrl(text);

    if (ctx.session && ctx.session.__scenes) {
      ctx.session.__scenes.url = text;
    } else {
      throw new Error(MESSAGES.ERROR.NO_SESSION);
    }

    switch (platform) {
      case EPlatform.YOUTUBE:
        await ctx.scene.enter(YOUTUBE_SCENE_NAME);
        break;
      default:
        throw new Error(MESSAGES.ERROR.UNSUPPORTED_PLATFORM);
    }
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
