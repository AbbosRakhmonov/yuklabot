import "./config/env";
import "./config/patches";

import { traceRequest } from "./utils/requestHistory";
import { session } from "telegraf";
import { connectDatabase, disconnectDatabase } from "./config/database";
import { createBot } from "./config/bot";
import { startCommand } from "./commands/start.command";
import logger from "./config/logger";
import { loggerMiddleware } from "./middleware/logger";
import { userActivityMiddleware } from "./middleware/userActivity";
import { rateLimiter, rateLimiterMiddleware } from "./middleware/rateLimiter";
import { createWebhookServer, createApp } from "./config/webhook";
import { config } from "./config/config";
import { helpCommand } from "./commands/help.command";
import { adminCommand } from "./commands/admin.command";
import { handleTextMessage } from "./handlers/message.handler";
import { handleTiktokAudioButton } from "./handlers/tiktokAudio.handler";
import { TIKTOK_AUDIO_CALLBACK_REGEX } from "./scenes/tiktok/constants";
import {
  CANCEL_DOWNLOAD_REGEX,
  handleCancelDownload,
} from "./utils/downloadCancel";
import { stage } from "./scenes";
import { cleanupService } from "./services/cleanup.service";
import { userActivityCache } from "./utils/userActivityCache";
import { continuousAction } from "./utils/continuousAction";
import { UpdateQueue } from "./middleware/backgroundQueue";
import { getUserErrorMessage } from "./utils/errors";
import { killAllProcesses } from "./utils/processManager";
import { IMyContext } from "./interfaces/IMyContext";

let queue: UpdateQueue | undefined;

// Graceful shutdown function
const gracefulShutdown = async (): Promise<void> => {
  logger.info("Attempting graceful shutdown...");

  try {
    // Stop running downloads, they'd outlive the bot otherwise
    queue?.stop();
    killAllProcesses();

    // Stop cleanup service
    cleanupService.stop();

    // Stop continuous actions
    continuousAction.stopAll();

    // Stop user activity cache cleanup and rate limiter cleanup
    userActivityCache.stopCleanup();
    await userActivityCache.flushPending().catch(() => {});
    rateLimiter.stopCleanup();

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

// A stray rejected promise of one user must not take the bot down for everyone
process.on("unhandledRejection", (reason: unknown) => {
  logger.error("Unhandled Rejection", { reason });
});

const handleBotError = async (
  error: unknown,
  ctx: IMyContext
): Promise<void> => {
  logger.error(`Error for ${ctx.updateType}`, {
    error,
    updateType: ctx.updateType,
    userId: ctx.from?.id,
  });

  if (ctx.chat) {
    await ctx.reply(getUserErrorMessage(error)).catch(() => {});
  }
};

async function main(): Promise<void> {
  try {
    // Connect to MongoDB and get session store
    const store = await connectDatabase();

    // Create bot instance
    const bot = createBot();
    bot.botInfo = await bot.telegram.getMe();
    queue = new UpdateQueue(bot);

    // Middleware (order matters!)
    // ❌ under a progress message: must run before the per-user queue,
    // which is busy with the very download it stops
    bot.action(CANCEL_DOWNLOAD_REGEX, handleCancelDownload);

    bot.use(session({ store }));
    bot.use(traceRequest);

    // Commands
    bot.command("start", startCommand);
    bot.command("help", helpCommand);
    bot.command("admin", adminCommand);

    bot.use(rateLimiterMiddleware);
    bot.use(userActivityMiddleware);
    bot.use(loggerMiddleware);

    // Before the stage, so the button also works while another scene is active
    bot.action(TIKTOK_AUDIO_CALLBACK_REGEX, handleTiktokAudioButton);

    bot.use(stage.middleware());

    bot.on("message", handleTextMessage);

    // Error handling
    bot.catch(handleBotError);
    await queue.start();

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

      const app = await createWebhookServer(bot, config.webhook.url, queue);

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
      // Start Express dashboard & health server in polling mode
      const app = createApp(bot);
      app.listen(config.serverPort, "0.0.0.0", () => {
        logger.info(
          `✅ Dashboard & Health server is running on port ${config.serverPort}`
        );
        logger.info(
          `✅ Dashboard URL: http://localhost:${config.serverPort}/admin`
        );
      });

      await queue.poll();
    }
  } catch (error) {
    logger.error("Failed to start bot", { error });
    process.exit(1);
  }
}

main();
