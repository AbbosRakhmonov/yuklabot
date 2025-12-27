import dotenv from "dotenv";
import { session } from "telegraf";
import { connectDatabase, disconnectDatabase } from "./config/database";
import { createBot } from "./config/bot";
import { startCommand } from "./commands/start.command";
import logger from "./config/logger";
import { loggerMiddleware } from "./middleware/logger";
import { userActivityMiddleware } from "./middleware/userActivity";
import {
  createWebhookServer,
  setWebhook,
  deleteWebhook,
} from "./config/webhook";
import { config } from "./config/config";
import { helpCommand } from "./commands/help.command";
import { handleTextMessage } from "./handlers/message.handler";
import { stage } from "./scenes";

// Load environment variables
dotenv.config();

// Global error handlers to prevent bot from crashing
process.on("uncaughtException", (error: Error) => {
  logger.error("Uncaught Exception - keeping bot alive", {
    error: error.message,
    stack: error.stack,
  });
  process.exit(1);
});

process.on(
  "unhandledRejection",
  (reason: unknown, promise: Promise<unknown>) => {
    logger.error("Unhandled Rejection - keeping bot alive", {
      reason,
      promise,
    });
    process.exit(1);
  }
);

async function main(): Promise<void> {
  try {
    // Connect to MongoDB
    await connectDatabase();

    // Create bot instance
    const bot = createBot();

    bot.use(userActivityMiddleware);
    bot.use(loggerMiddleware);

    // Middleware (order matters!)
    bot.use(session());

    bot.use(stage.middleware());

    // 3. Custom middleware (userActivity should be before logger)

    // Commands
    bot.command("start", startCommand);
    bot.command("help", helpCommand);

    // Message handlers
    bot.on("message", handleTextMessage);

    // Error handling
    bot.catch((err, ctx) => {
      logger.error(`Error for ${ctx.updateType}`, {
        error: err,
        updateType: ctx.updateType,
      });
    });

    // Graceful shutdown handler
    const shutdown = async (signal: string): Promise<void> => {
      logger.info(`${signal} signal received: closing bot...`);

      if (config.webhook.enabled) {
        await deleteWebhook(bot);
      } else {
        bot.stop(signal);
      }

      await disconnectDatabase();
      process.exit(0);
    };

    process.once("SIGINT", () => shutdown("SIGINT"));
    process.once("SIGTERM", () => shutdown("SIGTERM"));

    // Start bot with webhook or polling
    if (config.webhook.enabled) {
      if (!config.webhook.url) {
        throw new Error("WEBHOOK_URL is required when WEBHOOK_ENABLED is true");
      }

      // Create Express server
      const app = createWebhookServer(bot);

      // Set webhook
      await setWebhook(bot, config.webhook.url);

      // Start server
      app.listen(config.webhook.port, () => {
        logger.info(
          `✅ Webhook server is running on port ${config.webhook.port}`
        );
        logger.info(
          `✅ Webhook URL: ${config.webhook.url}${config.webhook.path}`
        );
      });
    } else {
      // Launch bot with polling
      await bot.launch({
        dropPendingUpdates: true,
      });
      logger.info("✅ Bot is running with polling...");
    }
  } catch (error) {
    logger.error("Failed to start bot", { error });
    process.exit(1);
  }
}

main();
