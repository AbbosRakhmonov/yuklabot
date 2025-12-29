import express, { Express } from "express";
import { Telegraf } from "telegraf";
import logger from "./logger";
import { IMyContext } from "@/interfaces/IMyContext";
import { config } from "@/config/config";

export const createWebhookServer = async (
  bot: Telegraf<IMyContext>,
  webhookDomain: string
): Promise<Express> => {
  const app = express();

  // Middleware to parse JSON (if needed for other routes)
  app.use(express.json());

  // Health check endpoint
  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  // Get webhook path
  const webhookPath =
    config.webhook.path || `/webhook/${process.env.BOT_TOKEN?.split(":")[0]}`;

  logger.info(`Webhook path: ${webhookPath}`);

  // Create webhook options
  const webhookOptions = {
    domain: webhookDomain,
    path: webhookPath,
    ...(config.webhook.secretToken && {
      secret_token: config.webhook.secretToken,
    }),
  };

  // Use bot.createWebhook() - this returns Express middleware
  // and automatically sets the webhook with Telegram
  app.use(await bot.createWebhook(webhookOptions));

  logger.info(
    `✅ Webhook server configured at: ${webhookDomain}${webhookPath}`
  );
  logger.info(
    `Secret token: ${config.webhook.secretToken ? "Enabled" : "Disabled"}`
  );

  return app;
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
