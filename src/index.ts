import "./config/env";

import { session } from "telegraf";
import { connectDatabase, disconnectDatabase } from "./config/database";
import { createBot } from "./config/bot";
import { startCommand } from "./commands/start.command";
import logger from "./config/logger";
import { loggerMiddleware } from "./middleware/logger";
import { userActivityMiddleware } from "./middleware/userActivity";
import { rateLimiterMiddleware } from "./middleware/rateLimiter";
import { createWebhookServer, deleteWebhook } from "./config/webhook";
import { config } from "./config/config";
import { helpCommand } from "./commands/help.command";
import { handleTextMessage } from "./handlers/message.handler";
import { stage } from "./scenes";
import { cleanupService } from "./services/cleanup.service";
import { userActivityCache } from "./utils/userActivityCache";
import { continuousAction } from "./utils/continuousAction";

// Store bot instance for graceful shutdown
let botInstance: ReturnType<typeof createBot> | null = null;

// Graceful shutdown function
const gracefulShutdown = async (): Promise<void> => {
  logger.info("Attempting graceful shutdown...");

  try {
    // Stop cleanup service
    cleanupService.stop();

    // Stop continuous actions
    continuousAction.stopAll();

    // Stop user activity cache cleanup
    userActivityCache.stopCleanup();

    // Stop bot if it exists
    if (botInstance) {
      if (config.webhook.enabled) {
        await deleteWebhook(botInstance);
      } else {
        botInstance.stop("SIGTERM");
      }
    }

    // Disconnect database
    await disconnectDatabase();

    logger.info("Graceful shutdown completed");
    process.exit(0);
  } catch (error) {
    logger.error("Error during graceful shutdown", { error });
    process.exit(1);
  }
};

// Global error handlers with graceful shutdown attempt
process.on("uncaughtException", async (error: Error) => {
  logger.error("Uncaught Exception", {
    error: error.message,
    stack: error.stack,
  });

  // Attempt graceful shutdown with timeout
  const shutdownTimeout = setTimeout(() => {
    logger.error("Graceful shutdown timeout, forcing exit");
    process.exit(1);
  }, 10000); // 10 seconds timeout

  try {
    await gracefulShutdown();
    clearTimeout(shutdownTimeout);
  } catch {
    clearTimeout(shutdownTimeout);
    process.exit(1);
  }
});

process.on(
  "unhandledRejection",
  async (reason: unknown, promise: Promise<unknown>) => {
    logger.error("Unhandled Rejection", {
      reason,
      promise,
    });

    // Attempt graceful shutdown with timeout
    const shutdownTimeout = setTimeout(() => {
      logger.error("Graceful shutdown timeout, forcing exit");
      process.exit(1);
    }, 10000); // 10 seconds timeout

    try {
      await gracefulShutdown();
      clearTimeout(shutdownTimeout);
    } catch {
      clearTimeout(shutdownTimeout);
      process.exit(1);
    }
  }
);

async function main(): Promise<void> {
  try {
    // Connect to MongoDB and get session store
    const store = await connectDatabase();

    // Create bot instance
    const bot = createBot();
    botInstance = bot; // Store for graceful shutdown

    // Middleware (order matters!)
    bot.use(session({ store }));

    // Commands
    bot.command("start", startCommand);
    bot.command("help", helpCommand);

    bot.use(rateLimiterMiddleware);
    bot.use(userActivityMiddleware);
    bot.use(loggerMiddleware);

    bot.use(stage.middleware());

    bot.on("message", handleTextMessage);

    // Error handling
    bot.catch((err, ctx) => {
      logger.error(`Error for ${ctx.updateType}`, {
        error: err,
        updateType: ctx.updateType,
      });
    });

    // Graceful shutdown handler for signals
    const shutdown = async (signal: string): Promise<void> => {
      logger.info(`${signal} signal received: closing bot...`);
      await gracefulShutdown();
    };

    process.once("SIGINT", () => shutdown("SIGINT"));
    process.once("SIGTERM", () => shutdown("SIGTERM"));

    // Start cleanup service
    cleanupService.start();

    // Start bot with webhook or polling
    if (config.webhook.enabled) {
      if (!config.webhook.url) {
        throw new Error("WEBHOOK_URL is required when WEBHOOK_ENABLED is true");
      }

      // Create Express server with bot.createWebhook()
      const app = await createWebhookServer(bot, config.webhook.url);

      // Start server
      app.listen(config.webhook.port, "0.0.0.0", () => {
        logger.info(
          `✅ Webhook server is running on port ${config.webhook.port}`
        );
        logger.info(
          `✅ Webhook URL: ${config.webhook.url}${
            config.webhook.path ||
            `/webhook/${process.env.BOT_TOKEN?.split(":")[0]}`
          }`
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
