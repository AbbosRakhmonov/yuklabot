// src/middleware/handlePlatform.ts
import { MESSAGES } from "@/constants";
import logger from "@/config/logger";
import { IMyContext } from "@/interfaces/IMyContext";
import { getPlatformByUrl, isValidUrl } from "@/helpers";
import { EPlatform } from "@/enums/EPlatform";
import { YOUTUBE_SCENE_NAME } from "@/scenes/youtube/constants";
import { INSTAGRAM_SCENE_NAME } from "@/scenes/instagram/constants";
import { message } from "telegraf/filters";

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

  logger.info("Text message received", { text, userId: ctx.from?.id });

  await ctx.react("👀");

  const platform = await getPlatformByUrl(text);

  // clear message text
  ctx.message.text = "";

  switch (platform) {
    case EPlatform.YOUTUBE:
      await ctx.scene.enter(YOUTUBE_SCENE_NAME, { youtube: { url: text } });
      break;
    case EPlatform.INSTAGRAM:
      await ctx.scene.enter(INSTAGRAM_SCENE_NAME, { instagram: { url: text } });
      break;
    default:
      throw new Error(MESSAGES.ERROR.UNSUPPORTED_PLATFORM);
  }
};
