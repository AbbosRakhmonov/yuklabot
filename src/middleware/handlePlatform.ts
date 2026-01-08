// src/middleware/handlePlatform.ts
import { MESSAGES } from "@/constants";
import logger from "@/config/logger";
import { IMyContext } from "@/interfaces/IMyContext";
import { getPlatformByUrl, isValidUrl } from "@/helpers";
import { EPlatform } from "@/enums/EPlatform";
import { YOUTUBE_SCENE_NAME } from "@/scenes/youtube/constants";
import { INSTAGRAM_SCENE_NAME } from "@/scenes/instagram/constants";
import { TIKTOK_SCENE_NAME } from "@/scenes/tiktok/constants";
import { message } from "telegraf/filters";
import { sanitizeUrl } from "@/helpers/sanitizeUrl";

export const handlePlatform = async (ctx: IMyContext) => {
  if (!ctx.has(message("text")))
    throw new Error(MESSAGES.ERROR.INVALID_MESSAGE);

  if (ctx.scene?.current) {
    await ctx.reply(MESSAGES.INFO.OPERATION_IN_PROGRESS);
    return;
  }

  const text = ctx.message.text.trim();

  if (!isValidUrl(text)) {
    throw new Error(MESSAGES.ERROR.INVALID_URL);
  }

  // Sanitize URL before processing
  const sanitizedUrl = sanitizeUrl(text);

  logger.info("Text message received", {
    text: sanitizedUrl,
    userId: ctx.from?.id,
  });

  // Fire-and-forget: don't await to avoid blocking other users
  ctx.react("👀").catch((error) => {
    logger.error("Error sending reaction", { error, userId: ctx.from?.id });
  });

  const platform = await getPlatformByUrl(sanitizedUrl);

  // clear message text
  ctx.message.text = "";

  switch (platform) {
    case EPlatform.YOUTUBE:
      await ctx.scene.enter(YOUTUBE_SCENE_NAME, {
        youtube: { url: sanitizedUrl },
      });
      break;
    case EPlatform.INSTAGRAM:
      await ctx.scene.enter(INSTAGRAM_SCENE_NAME, {
        instagram: { url: sanitizedUrl },
      });
      break;
    case EPlatform.TIKTOK:
      await ctx.scene.enter(TIKTOK_SCENE_NAME, {
        tiktok: { url: sanitizedUrl },
      });
      break;
    default:
      throw new Error(MESSAGES.ERROR.UNSUPPORTED_PLATFORM);
  }
};
