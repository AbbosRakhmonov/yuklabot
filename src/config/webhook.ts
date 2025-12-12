import express, { Express } from "express";
import { Telegraf } from "telegraf";
import logger from "./logger";
import { IMyContext } from "@/interfaces/IMyContext";

export const createWebhookServer = (bot: Telegraf<IMyContext>): Express => {
  const app = express();

  // Middleware to parse JSON
  app.use(express.json());

  // Health check endpoint
  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  // Webhook secret path from environment or default
  const webhookPath =
    process.env.WEBHOOK_PATH ||
    `/webhook/${process.env.BOT_TOKEN?.split(":")[0]}`;

  // Set webhook endpoint - webhookCallback returns an Express middleware
  app.post(webhookPath, bot.webhookCallback());

  logger.info(`Webhook server configured at path: ${webhookPath}`);

  return app;
};

export const setWebhook = async (
  bot: Telegraf<IMyContext>,
  webhookUrl: string
): Promise<void> => {
  try {
    const webhookPath =
      process.env.WEBHOOK_PATH ||
      `/webhook/${process.env.BOT_TOKEN?.split(":")[0]}`;
    const fullWebhookUrl = `${webhookUrl}${webhookPath}`;

    await bot.telegram.setWebhook(fullWebhookUrl);
    logger.info(`Webhook set to: ${fullWebhookUrl}`);
  } catch (error) {
    logger.error("Failed to set webhook", { error });
    throw error;
  }
};

export const deleteWebhook = async (
  bot: Telegraf<IMyContext>
): Promise<void> => {
  try {
    await bot.telegram.deleteWebhook();
    logger.info("Webhook deleted");
  } catch (error) {
    logger.error("Failed to delete webhook", { error });
    throw error;
  }
};
