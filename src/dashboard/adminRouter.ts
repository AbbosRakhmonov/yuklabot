import express, { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { Telegraf } from "telegraf";
import { config } from "@/config/config";
import logger from "@/config/logger";
import { activeTasks } from "@/utils/activeTasks";
import User from "@/models/User";
import Download from "@/models/Download";
import YoutubeDownload from "@/models/YoutubeDownload";
import InstagramDownload from "@/models/InstagramDownload";
import TiktokDownload from "@/models/TiktokDownload";
import { EMediaType } from "@/enums/EMediaType";
import { myDayjs } from "@/utils/myDayjs";
import os from "os";
import fs from "fs/promises";
import { IMyContext } from "@/interfaces/IMyContext";
import { getDashboardHtml } from "./dashboardView";

export const createAdminRouter = (bot: Telegraf<IMyContext>): express.Router => {
  const router = express.Router();

  // In-memory admin tokens: token -> expiration timestamp
  const validTokens = new Map<string, number>();
  const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

  const generateToken = (): string => {
    const token = crypto.randomBytes(32).toString("hex");
    validTokens.set(token, Date.now() + TOKEN_TTL_MS);
    return token;
  };

  const verifyToken = (token?: string): boolean => {
    if (!token) return false;
    const expiresAt = validTokens.get(token);
    if (!expiresAt) return false;
    if (Date.now() > expiresAt) {
      validTokens.delete(token);
      return false;
    }
    return true;
  };

  // Auth Middleware
  const requireAdminAuth = (req: Request, res: Response, next: NextFunction): void => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7)
      : (req.query.token as string | undefined);

    if (verifyToken(token)) {
      next();
      return;
    }

    res.status(401).json({ error: "Unauthorized: Invalid or expired token" });
  };

  // 1. Dashboard Single Page App
  router.get("/", (_req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(getDashboardHtml());
  });

  // 2. Login endpoint
  router.post("/api/login", (req: Request, res: Response) => {
    const { username, password } = req.body;

    if (
      username === config.admin.username &&
      password === config.admin.password
    ) {
      const token = generateToken();
      res.json({
        token,
        adminChatId: config.admin.chatId,
        username: config.admin.username,
      });
      return;
    }

    res.status(401).json({ error: "Noto'g'ri foydalanuvchi nomi yoki parol" });
  });

  // 3. Overall Statistics
  router.get("/api/stats", requireAdminAuth, async (_req: Request, res: Response) => {
    try {
      const todayStart = myDayjs().startOf("day").toDate();
      const thisWeekStart = myDayjs().subtract(7, "day").startOf("day").toDate();

      const [
        totalUsers,
        todayActiveUsers,
        todayNewUsers,
        totalDownloads,
        todayDownloads,
        thisWeekDownloads,
        youtubeDownloads,
        instagramDownloads,
        tiktokDownloads,
      ] = await Promise.all([
        User.countDocuments(),
        User.countDocuments({ lastActiveAt: { $gte: todayStart } }),
        User.countDocuments({ firstSeenAt: { $gte: todayStart } }),
        Download.countDocuments(),
        Download.countDocuments({ createdAt: { $gte: todayStart } }),
        Download.countDocuments({ createdAt: { $gte: thisWeekStart } }),
        YoutubeDownload.countDocuments(),
        InstagramDownload.countDocuments(),
        TiktokDownload.countDocuments(),
      ]);

      // System stats
      const mem = process.memoryUsage();
      const totalMem = os.totalmem();
      const freeMem = os.freemem();

      let diskPercentFree = 0;
      let diskFreeGB = "0";
      let diskTotalGB = "0";
      try {
        const stats = await fs.statfs(config.downloadDir).catch(() => fs.statfs("."));
        const freeBytes = stats.bavail * stats.bsize;
        const totalBytes = stats.blocks * stats.bsize;
        diskPercentFree = parseFloat(((freeBytes / totalBytes) * 100).toFixed(1));
        diskFreeGB = (freeBytes / (1024 * 1024 * 1024)).toFixed(1);
        diskTotalGB = (totalBytes / (1024 * 1024 * 1024)).toFixed(1);
      } catch {
        // ignore
      }

      const taskSummary = activeTasks.getSummary();

      res.json({
        users: {
          total: totalUsers,
          todayActive: todayActiveUsers,
          todayNew: todayNewUsers,
        },
        downloads: {
          total: totalDownloads,
          today: todayDownloads,
          thisWeek: thisWeekDownloads,
          byPlatform: {
            youtube: youtubeDownloads,
            instagram: instagramDownloads,
            tiktok: tiktokDownloads,
          },
        },
        activeTasks: {
          total: taskSummary.activeCount,
          stuck: taskSummary.stuckCount,
          byPlatform: taskSummary.platformCounts,
        },
        system: {
          memoryUsedMB: (mem.rss / (1024 * 1024)).toFixed(1),
          memoryTotalMB: (totalMem / (1024 * 1024)).toFixed(0),
          memoryFreeMB: (freeMem / (1024 * 1024)).toFixed(0),
          memoryPercent: ((mem.rss / totalMem) * 100).toFixed(1),
          diskFreeGB,
          diskTotalGB,
          diskPercentFree,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Admin stats error", { error });
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  // 4. Live Active Tasks
  router.get("/api/active", requireAdminAuth, (_req: Request, res: Response) => {
    res.json({
      active: activeTasks.getActiveTasks(),
      recent: activeTasks.getRecentCompleted(),
    });
  });

  // 5. Kill Task endpoint
  router.post("/api/kill/:taskId", requireAdminAuth, (req: Request, res: Response) => {
    const taskId = String(req.params.taskId);
    const success = activeTasks.killTask(taskId);

    if (success) {
      res.json({ success: true, message: `Task ${taskId} muvaffaqiyatli to'xtatildi` });
    } else {
      res.status(404).json({ success: false, error: "Task topilmadi yoki allaqachon tugagan" });
    }
  });

  // 6. Download History with Filters
  router.get("/api/history", requireAdminAuth, async (req: Request, res: Response) => {
    try {
      const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 20));
      const skip = (page - 1) * limit;

      const { platform, mediaType, startDate, endDate, search } = req.query;

      const filter: Record<string, unknown> = {};

      if (platform && platform !== "all") {
        filter.platform = platform;
      }

      if (mediaType && mediaType !== "all") {
        filter.mediaType = mediaType;
      }

      if (startDate || endDate) {
        filter.createdAt = {};
        if (startDate) {
          (filter.createdAt as Record<string, unknown>).$gte = myDayjs(startDate as string).startOf("day").toDate();
        }
        if (endDate) {
          (filter.createdAt as Record<string, unknown>).$lte = myDayjs(endDate as string).endOf("day").toDate();
        }
      }

      if (search) {
        const searchRegex = new RegExp(String(search).trim(), "i");
        filter.$or = [
          { fileName: searchRegex },
          { url: searchRegex },
        ];
      }

      const [items, total] = await Promise.all([
        Download.find(filter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .populate("user", "telegramId username firstName")
          .lean(),
        Download.countDocuments(filter),
      ]);

      res.json({
        items,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      logger.error("Admin history error", { error });
      res.status(500).json({ error: "Failed to fetch history" });
    }
  });

  // 7. Users List
  router.get("/api/users", requireAdminAuth, async (req: Request, res: Response) => {
    try {
      const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 20));
      const skip = (page - 1) * limit;
      const { search } = req.query;

      const filter: Record<string, unknown> = {};
      if (search) {
        const searchStr = String(search).trim();
        const numId = parseInt(searchStr, 10);
        if (!isNaN(numId)) {
          filter.$or = [{ telegramId: numId }, { username: new RegExp(searchStr, "i") }, { firstName: new RegExp(searchStr, "i") }];
        } else {
          filter.$or = [{ username: new RegExp(searchStr, "i") }, { firstName: new RegExp(searchStr, "i") }];
        }
      }

      const [users, total] = await Promise.all([
        User.find(filter)
          .sort({ lastActiveAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        User.countDocuments(filter),
      ]);

      res.json({
        users,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      logger.error("Admin users error", { error });
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  // 8. Send Media to Admin via Telegram
  router.post("/api/send-file", requireAdminAuth, async (req: Request, res: Response) => {
    try {
      const { downloadId, chatId } = req.body;
      const targetChatId = chatId || config.admin.chatId;

      if (!targetChatId) {
        res.status(400).json({
          error: "Admin chat ID belgilanmagan. Iltimos, ADMIN_CHAT_ID sozlang yoki chat ID kiriting.",
        });
        return;
      }

      const download = await Download.findById(downloadId).lean();
      if (!download) {
        res.status(404).json({ error: "Yuklangan fayl topilmadi" });
        return;
      }

      let sent = false;

      // 1. Try copyMessage from source chat if messageId and chatId are available
      try {
        await bot.telegram.copyMessage(targetChatId, download.chatId, download.messageId, {
          caption: `📂 Admin tekshiruvi\n\n📌 Nomi: ${download.fileName || "Nomsiz"}\n🔗 Link: ${download.url}\n🆔 Platform: ${download.platform}`,
        });
        sent = true;
      } catch (copyErr) {
        logger.warning("copyMessage failed for admin send-file, falling back to fileId", { copyErr });
      }

      // 2. Fallback to fileId
      if (!sent && download.fileId) {
        switch (download.mediaType) {
          case EMediaType.VIDEO:
          case EMediaType.REEL:
            await bot.telegram.sendVideo(targetChatId, download.fileId, {
              caption: `📂 Admin tekshiruvi (fileId)\n\n📌 Nomi: ${download.fileName || "Nomsiz"}\n🔗 Link: ${download.url}`,
            });
            sent = true;
            break;
          case EMediaType.AUDIO:
            await bot.telegram.sendAudio(targetChatId, download.fileId, {
              caption: `🎵 Admin tekshiruvi (fileId)\n\n📌 Nomi: ${download.fileName || "Nomsiz"}\n🔗 Link: ${download.url}`,
            });
            sent = true;
            break;
          case EMediaType.IMAGE:
            await bot.telegram.sendPhoto(targetChatId, download.fileId, {
              caption: `🖼 Admin tekshiruvi (fileId)\n\n📌 Nomi: ${download.fileName || "Nomsiz"}\n🔗 Link: ${download.url}`,
            });
            sent = true;
            break;
          default:
            await bot.telegram.sendDocument(targetChatId, download.fileId, {
              caption: `📄 Admin tekshiruvi (fileId)\n\n📌 Nomi: ${download.fileName || "Nomsiz"}\n🔗 Link: ${download.url}`,
            });
            sent = true;
            break;
        }
      }

      if (sent) {
        res.json({ success: true, message: "Fayl Telegram orqali muvaffaqiyatli yuborildi!" });
      } else {
        res.status(400).json({
          error: "Faylni yuborib bo'lmadi: original xabar o'chirilgan va fileId mavjud emas.",
        });
      }
    } catch (error) {
      logger.error("Admin send-file error", { error });
      res.status(500).json({
        error: error instanceof Error ? error.message : "Faylni yuborishda xatolik yuz berdi",
      });
    }
  });

  // 9. Real-time Server-Sent Events (SSE)
  router.get("/api/events", (req: Request, res: Response) => {
    const token = req.query.token as string | undefined;
    if (!verifyToken(token)) {
      res.status(401).end();
      return;
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const sendUpdate = () => {
      const data = JSON.stringify({
        active: activeTasks.getActiveTasks(),
        summary: activeTasks.getSummary(),
        timestamp: new Date().toISOString(),
      });
      res.write(`data: ${data}\n\n`);
    };

    // Send initial snapshot
    sendUpdate();

    // Listen to task manager changes
    const onChange = () => sendUpdate();
    activeTasks.on("change", onChange);

    // Heartbeat every 15s to keep connection alive
    const heartbeat = setInterval(() => {
      res.write(": heartbeat\n\n");
    }, 15000);

    req.on("close", () => {
      clearInterval(heartbeat);
      activeTasks.removeListener("change", onChange);
      res.end();
    });
  });

  return router;
};
