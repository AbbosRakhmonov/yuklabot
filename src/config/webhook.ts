import express, { Express } from "express";
import { Telegraf } from "telegraf";
import logger from "./logger";
import { IMyContext } from "@/interfaces/IMyContext";
import { config } from "@/config/config";

export const createWebhookServer = (bot: Telegraf<IMyContext>): Express => {
  const app = express();

  // Middleware to parse JSON
  app.use(express.json());

  // Health check endpoint
  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  // Get webhook path
  const webhookPath =
    config.webhook.path || `/webhook/${process.env.BOT_TOKEN?.split(":")[0]}`;
  const secretToken = config.webhook.secretToken || "";

  logger.info(`Webhook path: ${webhookPath}`);

  // If secret token is configured, add verification middleware BEFORE webhook callback
  if (secretToken) {
    app.post(webhookPath, (req, res, next) => {
      const token = req.headers["x-telegram-bot-api-secret-token"];
      if (token !== secretToken) {
        logger.warning("Unauthorized webhook request");
        return res.status(401).send("Unauthorized");
      }
      return next();
    });
  }

  // Register webhook callback - this handles the request/response automatically
  // According to official docs: app.use(bot.webhookCallback(webhookPath))
  app.post(webhookPath, bot.webhookCallback());

  logger.info(`✅ Webhook server configured at path: ${webhookPath}`);
  logger.info(`Secret token: ${secretToken ? "Enabled" : "Disabled"}`);

  return app;
};

export const setWebhook = async (
  bot: Telegraf<IMyContext>,
  webhookUrl: string
): Promise<void> => {
  try {
    const webhookPath =
      config.webhook.path || `/webhook/${process.env.BOT_TOKEN?.split(":")[0]}`;
    const fullWebhookUrl = `${webhookUrl}${webhookPath}`;

    const options: { secret_token?: string } = {};
    if (config.webhook.secretToken) {
      options.secret_token = config.webhook.secretToken;
    }

    await bot.telegram.setWebhook(fullWebhookUrl, options);
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
