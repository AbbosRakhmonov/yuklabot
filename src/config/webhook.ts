import express, { Express } from "express";
import { Telegraf } from "telegraf";
import logger from "./logger";
import { IMyContext } from "@/interfaces/IMyContext";
import { config } from "@/config/config";
import rateLimit from "express-rate-limit";
import mongoose from "mongoose";
import fs from "fs/promises";
import os from "os";

export const createWebhookServer = async (
  bot: Telegraf<IMyContext>,
  webhookDomain: string
): Promise<Express> => {
  // Validate webhook secret token in production
  if (process.env.NODE_ENV === "production" && !config.webhook.secretToken) {
    throw new Error(
      "WEBHOOK_SECRET_TOKEN is required in production when webhook is enabled"
    );
  }

  const app = express();

  // Middleware to parse JSON (if needed for other routes)
  app.use(
    express.json({
      limit: "1mb",
    })
  );
  app.use(
    rateLimit({
      windowMs: 60000, // 1 minute
      max: 100, // limit each IP to 100 requests per windowMs
    })
  );

  // Health check endpoint
  app.get("/health", async (_req, res) => {
    const health: {
      status: string;
      database: string;
      diskSpace?: { free: string; total: string; percentFree: number };
      memory: { used: string; total: string; percentUsed: number };
      activeDownloads?: number;
      timestamp: string;
    } = {
      status: "ok",
      database: "unknown",
      memory: {
        used: "0",
        total: "0",
        percentUsed: 0,
      },
      timestamp: new Date().toISOString(),
    };

    // Check database connection
    try {
      if (mongoose.connection.readyState === 1) {
        health.database = "connected";
      } else {
        health.database = "disconnected";
        health.status = "degraded";
      }
    } catch (error) {
      logger.debug("Failed to check database connection", { error });
      health.database = "error";
      health.status = "degraded";
    }

    // Check disk space (using os.freemem as approximation)
    try {
      const freeMem = os.freemem();
      const totalMem = os.totalmem();
      const freeGB = (freeMem / (1024 * 1024 * 1024)).toFixed(2);
      const totalGB = (totalMem / (1024 * 1024 * 1024)).toFixed(2);
      const percentFree = ((freeMem / totalMem) * 100).toFixed(1);
      health.diskSpace = {
        free: `${freeGB} GB`,
        total: `${totalGB} GB`,
        percentFree: parseFloat(percentFree),
      };
      // Mark as degraded if memory is below 10%
      if (parseFloat(percentFree) < 10) {
        health.status = "degraded";
      }
    } catch (error) {
      // Disk space check failed, but don't fail health check
      logger.debug("Failed to check disk space", { error });
    }

    // Check memory usage
    const memUsage = process.memoryUsage();
    const totalMem = os.totalmem();
    const usedMem = memUsage.heapUsed;
    const percentUsed = ((usedMem / totalMem) * 100).toFixed(1);
    health.memory = {
      used: `${(usedMem / (1024 * 1024)).toFixed(2)} MB`,
      total: `${(totalMem / (1024 * 1024)).toFixed(2)} MB`,
      percentUsed: parseFloat(percentUsed),
    };

    // Check active downloads (count folders in download directory)
    try {
      const downloadDir = config.downloadDir;
      try {
        await fs.access(downloadDir);
        const entries = await fs.readdir(downloadDir, { withFileTypes: true });
        health.activeDownloads = entries.filter((e) => e.isDirectory()).length;
      } catch {
        health.activeDownloads = 0;
      }
    } catch (error) {
      logger.debug("Failed to check active downloads", { error });
      // Ignore errors
    }

    // Return 503 if critical services are down
    const statusCode = health.status === "ok" ? 200 : 503;
    res.status(statusCode).json(health);
  });

  // Get webhook path
  const webhookPath =
    config.webhook.path || `/webhook/${process.env.BOT_TOKEN?.split(":")[0]}`;

  logger.info(`Webhook path: ${webhookPath}`);

  // Create webhook options
  const webhookOptions = {
    domain: webhookDomain,
    path: webhookPath,
    drop_pending_updates: true,
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
