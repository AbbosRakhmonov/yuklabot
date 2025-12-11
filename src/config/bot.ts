import { Context, Telegraf } from "telegraf";
import { config } from "./config";
import logger from "./logger";
import { Update } from "telegraf/typings/core/types/typegram";

export const createBot = (): Telegraf => {
  const botToken = process.env.BOT_TOKEN;

  if (!botToken) {
    throw new Error("BOT_TOKEN is not defined in environment variables");
  }

  // Configure bot options for Local Bot API if enabled
  const botOptions: Partial<Telegraf.Options<Context<Update>>> = {};

  if (
    config.telegram.localMode ||
    config.telegram.apiRoot !== "https://api.telegram.org"
  ) {
    botOptions.telegram = {
      apiRoot: config.telegram.apiRoot,
    };
    logger.info(`Using Local Bot API at: ${config.telegram.apiRoot}`);
  }

  return new Telegraf(botToken, botOptions);
};
