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

  // Webhook secret path from environment or default
  const webhookPath =
    process.env.WEBHOOK_PATH ||
    `/webhook/${process.env.BOT_TOKEN?.split(":")[0]}`;

  // Add secret token verification if configured
  const secretToken = config.webhook.secretToken || "";

  // Create webhook handler with optional secret token verification
  const webhookHandler = (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    // If secret token is configured, verify it
    if (secretToken) {
      const token = req.headers["x-telegram-bot-api-secret-token"];
      if (token !== secretToken) {
        logger.warn("Unauthorized webhook request", {
          ip: req.ip,
          path: req.path,
        });
        return res.status(401).send("Unauthorized");
      }
    }
    // Pass to bot webhook callback
    return bot.webhookCallback()(req, res, next);
  };

  // Set webhook endpoint - only POST requests
  app.post(webhookPath, webhookHandler);

  logger.info(`Webhook server configured at path: ${webhookPath}`);
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

    await bot.telegram.setWebhook(fullWebhookUrl, {
      // Optional: Set secret token for security
      secret_token: config.webhook.secretToken,
    });
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
