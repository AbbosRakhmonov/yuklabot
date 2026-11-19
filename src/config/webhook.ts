import type { UpdateQueue } from "@/middleware/backgroundQueue";
import express, { Express, Request } from "express";
import { Telegraf } from "telegraf";
import logger from "./logger";
import { IMyContext } from "@/interfaces/IMyContext";
import { config } from "@/config/config";
import rateLimit from "express-rate-limit";
import mongoose from "mongoose";
import fs from "fs/promises";
import os from "os";
import { activeTasks } from "@/utils/activeTasks";
import { createAdminRouter } from "@/dashboard/adminRouter";

export const createApp = (bot: Telegraf<IMyContext>): Express => {
  const app = express();

  // Trust proxy to correctly identify client IP when behind reverse proxy/load balancer
  const trustProxy = process.env.TRUST_PROXY;
  if (trustProxy === "false") {
    app.set("trust proxy", false);
  } else if (trustProxy) {
    const proxyCount = parseInt(trustProxy, 10);
    if (!isNaN(proxyCount) && proxyCount >= 0) {
      app.set("trust proxy", proxyCount);
    } else {
      logger.warning(
        `Invalid TRUST_PROXY value "${trustProxy}", defaulting to 1. Use a number (e.g., "1") or "false".`
      );
      app.set("trust proxy", 1);
    }
  } else {
    app.set("trust proxy", 1);
  }

  // Webhook path
  const webhookPath =
    config.webhook.path || `/webhook/${process.env.BOT_TOKEN?.split(":")[0]}`;

  // Middleware to parse JSON
  app.use(
    express.json({
      limit: "1mb",
    })
  );

  // Rate limiter (Telegram updates and admin dashboard endpoints skip rate limiting)
  app.use(
    rateLimit({
      windowMs: 60000, // 1 minute
      max: 120, // limit each IP to 120 requests per windowMs
      skip: (req: Request) =>
        req.path === webhookPath || req.path.startsWith("/admin"),
    })
  );

  // Mount Admin Dashboard Router
  app.use("/admin", createAdminRouter(bot));

  // Redirect root to /admin
  app.get("/", (_req, res) => {
    res.redirect("/admin");
  });

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

    // Check free space on download directory
    try {
      const stats = await fs
        .statfs(config.downloadDir)
        .catch(() => fs.statfs("."));
      const freeBytes = stats.bavail * stats.bsize;
      const totalBytes = stats.blocks * stats.bsize;
      const percentFree = ((freeBytes / totalBytes) * 100).toFixed(1);
      health.diskSpace = {
        free: `${(freeBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`,
        total: `${(totalBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`,
        percentFree: parseFloat(percentFree),
      };
      if (parseFloat(percentFree) < 10) {
        health.status = "degraded";
      }
    } catch (error) {
      logger.debug("Failed to check disk space", { error });
    }

    // Check memory usage
    const memUsage = process.memoryUsage();
    const totalMem = os.totalmem();
    const usedMem = memUsage.rss;
    const percentUsed = ((usedMem / totalMem) * 100).toFixed(1);
    health.memory = {
      used: `${(usedMem / (1024 * 1024)).toFixed(2)} MB`,
      total: `${(totalMem / (1024 * 1024)).toFixed(2)} MB`,
      percentUsed: parseFloat(percentUsed),
    };

    health.activeDownloads = activeTasks.getSummary().activeCount;

    const statusCode = health.status === "ok" ? 200 : 503;
    res.status(statusCode).json(health);
  });

  return app;
};

export const createWebhookServer = async (
  bot: Telegraf<IMyContext>,
  webhookDomain: string,
  queue: UpdateQueue
): Promise<Express> => {
  // Validate webhook secret token in production
  if (process.env.NODE_ENV === "production" && !config.webhook.secretToken) {
    throw new Error(
      "WEBHOOK_SECRET_TOKEN is required in production when webhook is enabled"
    );
  }

  const app = createApp(bot);

  const webhookPath =
    config.webhook.path || `/webhook/${process.env.BOT_TOKEN?.split(":")[0]}`;

  const domain = new URL(webhookDomain.includes("://") ? webhookDomain : "https://" + webhookDomain);
  await bot.telegram.setWebhook("https://" + domain.host + webhookPath, {
    drop_pending_updates: false,
    ...(config.webhook.secretToken && { secret_token: config.webhook.secretToken }),
  });
  app.post(webhookPath, async (req, res) => {
    if (config.webhook.secretToken && req.get("X-Telegram-Bot-Api-Secret-Token") !== config.webhook.secretToken) {
      res.sendStatus(403);
      return;
    }
    if (!Number.isSafeInteger(req.body?.update_id)) {
      res.sendStatus(400);
      return;
    }
    try {
      await queue.accept(req.body);
      res.sendStatus(200);
    } catch (error) {
      logger.error("Webhook admission failed", { error });
      res.sendStatus(503);
    }
  });

  logger.info(
    `✅ Webhook server configured at: ${webhookDomain}${webhookPath}`
  );
  logger.info(
    `Secret token: ${config.webhook.secretToken ? "Enabled" : "Disabled"}`
  );

  return app;
};
