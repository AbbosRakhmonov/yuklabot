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
    config.webhook.path || `/webhook/${process.env.BOT_TOKEN?.split(":")[0]}`;

  logger.info(`Webhook path: ${webhookPath}`);
  logger.info(`BOT_TOKEN prefix: ${process.env.BOT_TOKEN?.split(":")[0]}`);

  // Add secret token verification if configured
  const secretToken = config.webhook.secretToken || "";

  // Create webhook handler with optional secret token verification
  const webhookHandler = (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    logger.info("Webhook request received", {
      path: req.path,
      originalUrl: req.originalUrl,
      method: req.method,
    });

    // If secret token is configured, verify it
    if (secretToken) {
      const token = req.headers["x-telegram-bot-api-secret-token"];
      if (token !== secretToken) {
        logger.warning("Unauthorized webhook request", {
          ip: req.ip,
          path: req.path,
        });
        return res.status(401).send("Unauthorized");
      }
    }

    // Pass to bot webhook callback
    try {
      const callback = bot.webhookCallback();
      return callback(req, res, next);
    } catch (error) {
      logger.error("Error in webhook callback", {
        error: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({ error: "Internal server error" });
    }
  };

  // Set webhook endpoint - only POST requests
  app.post(webhookPath, webhookHandler);

  logger.info(`✅ Registered POST route: ${webhookPath}`);

  logger.info(`Webhook server configured at path: ${webhookPath}`);
  logger.info(`Secret token: ${secretToken ? "Enabled" : "Disabled"}`);

  app.use((req, res) => {
    logger.warning(`Route not found: ${req.method} ${req.path}`, {
      expected: webhookPath,
      received: req.path,
    });
    res.status(404).json({
      error: "Not found",
      expected: webhookPath,
      received: req.path,
    });
  });

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
