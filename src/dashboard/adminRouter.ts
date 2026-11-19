import { speedReport } from "./speedReport";
import { requestHistory } from "@/utils/requestHistory";
import DeliveryAttempt from "@/models/DeliveryAttempt";
import Forward from "@/models/Forward";
import { Types } from "mongoose";
import { materialPreview } from "./materialPreview";
import express, { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import rateLimit from "express-rate-limit";
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

  const sessions = new Map<string, Set<Response>>();
  const ttl = 24 * 60 * 60 * 1000;
  const cookie = "yuklabot_session";
  const cookieOptions = {
    path: "/admin", httpOnly: true, secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
  };
  const tokenFor = (req: Request) => req.headers.cookie?.split(";")
    .map(part => part.trim()).find(part => part.startsWith(cookie + "="))?.slice(cookie.length + 1);
  const revoke = (token: string) => {
    const streams = sessions.get(token);
    sessions.delete(token);
    for (const stream of streams ?? []) stream.end();
  };
  const requireAdminAuth = (req: Request, res: Response, next: NextFunction): void => {
    if (sessions.has(tokenFor(req) ?? "")) next();
    else res.status(401).json({ error: "Sessiya tugagan" });
  };
  router.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    if (config.admin.password.trim()) next();
    else res.status(503).send("Admin paneli sozlanmagan");
  });
  const loginLimit = rateLimit({
    windowMs: 15 * 60 * 1000, limit: 8, skipSuccessfulRequests: true,
    message: { error: "Urinishlar juda ko‘p. Keyinroq qayta urining." },
  });

  // 1. Dashboard Single Page App
  router.get("/", (_req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(getDashboardHtml());
  });

  // 2. Login endpoint
  router.post("/api/login", loginLimit, (req: Request, res: Response) => {
    const { username, password } = req.body ?? {};

    if (
      username === config.admin.username &&
      password === config.admin.password
    ) {
      const token = crypto.randomBytes(32).toString("hex");
      sessions.set(token, new Set());
      setTimeout(() => revoke(token), ttl).unref();
      res.cookie(cookie, token, { ...cookieOptions, secure: cookieOptions.secure || req.secure, maxAge: ttl });
      res.json({
        adminChatId: config.admin.chatId,
        username: config.admin.username,
      });
      return;
    }

    res.status(401).json({ error: "Noto'g'ri foydalanuvchi nomi yoki parol" });
  });

  router.get("/api/session", requireAdminAuth, (_req, res) => {
    res.json({ adminChatId: config.admin.chatId });
  });
  router.post("/api/logout", requireAdminAuth, (req, res) => {
    revoke(tokenFor(req)!);
    res.clearCookie(cookie, cookieOptions).sendStatus(204);
  });

  // 3. Overall Statistics
  router.get("/api/stats", requireAdminAuth, async (_req: Request, res: Response) => {
    try {
      const now = myDayjs().tz(config.timezone);
      const todayStart = now.startOf("day").toDate();
      const thisWeekStart = now.subtract(6, "day").startOf("day").toDate();

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
        outcomes,
        mediaCounts,
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
        DeliveryAttempt.aggregate<{ _id: { platform: string; outcome: string; reason?: string }; count: number }>([
          { $match: { finishedAt: { $gte: new Date(now.valueOf() - 86400000), $lte: now.toDate() } } },
          { $group: { _id: { platform: "$platform", outcome: "$outcome", reason: "$reason" }, count: { $sum: 1 } } },
        ]),
        Download.aggregate<{ _id: string; count: number }>([
          { $group: { _id: "$mediaType", count: { $sum: 1 } } },
        ]),
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
        outcomesAsOf: now.valueOf(),
        outcomes24h: outcomes.map(({ _id, count }) => ({ ..._id, count })),
        users: {
          total: totalUsers,
          todayActive: todayActiveUsers,
          todayNew: todayNewUsers,
        },
        downloads: {
          total: totalDownloads,
          today: todayDownloads,
          thisWeek: thisWeekDownloads,
          byMediaType: Object.fromEntries(mediaCounts.map(row => [row._id, row.count])),
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

      if (req.query.userId !== undefined) {
        const id = String(req.query.userId);
        if (!/^[a-f\d]{24}$/i.test(id)) {
          res.status(400).json({ error: "Foydalanuvchi ID noto‘g‘ri" });
          return;
        }
        const userId = new Types.ObjectId(id);
        const user = await User.findById(userId).select("telegramId username firstName").lean();
        if (!user) { res.sendStatus(404); return; }
        const { createdAt, ...materialFilter } = filter;
        const recipient = { user: userId, ...(createdAt ? { createdAt } : {}) };
        const [result] = await Download.aggregate([
          { $match: recipient },
          { $project: { material: "$_id", createdAt: 1 } },
          { $unionWith: { coll: Forward.collection.name, pipeline: [
            { $match: recipient }, { $project: { material: "$download", createdAt: 1 } },
          ] } },
          { $group: { _id: "$material", receivedAt: { $max: "$createdAt" } } },
          { $lookup: { from: Download.collection.name, localField: "_id", foreignField: "_id", as: "download" } },
          { $unwind: "$download" },
          { $replaceRoot: { newRoot: { $mergeObjects: ["$download", { createdAt: "$receivedAt" }] } } },
          { $match: materialFilter },
          { $facet: { items: [{ $sort: { createdAt: -1, _id: -1 } }, { $skip: skip }, { $limit: limit }],
            counts: [{ $count: "total" }] } },
        ]);
        const total = result?.counts[0]?.total ?? 0;
        res.json({ items: (result?.items ?? []).map((item: Record<string, unknown>) => ({
          ...item, user, preview: materialPreview(String(item.url)),
        })), pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
        return;
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
        items: items.map(item => ({ ...item, preview: materialPreview(item.url) })),
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
  router.get("/api/failures", requireAdminAuth, async (req, res) => {
    const { platform, reason } = req.query;
    const end = Number(req.query.asOf);
    const page = Number(req.query.page ?? 1);
    if (typeof platform !== "string" || !["youtube", "instagram", "tiktok"].includes(platform)
      || typeof reason !== "string" || !/^[a-z_]{1,40}$/.test(reason)
      || !Number.isSafeInteger(end) || end <= 0 || end > Date.now()
      || !Number.isSafeInteger(page) || page < 1 || page > 1000000) {
      res.status(400).end();
      return;
    }
    try {
      const [result] = await DeliveryAttempt.aggregate([
        { $match: { outcome: "failed", platform, reason, finishedAt: { $gte: new Date(end - 86400000), $lte: new Date(end) } } },
        { $set: { root: { $ifNull: ["$requestId", "$_id"] } } },
        { $lookup: { from: "telegram_updates", localField: "root", foreignField: "_id", as: "history" } },
        { $set: { history: { $arrayElemAt: ["$history", 0] } } },
        { $project: { finishedAt: 1, stage: 1, userId: { $ifNull: ["$userId", "$history.key"] },
          url: "$history.url", requestId: { $cond: ["$history.url", "$root", null] } } },
        { $facet: {
          items: [{ $sort: { finishedAt: -1, _id: -1 } }, { $skip: (page - 1) * 20 }, { $limit: 20 }],
          total: [{ $count: "n" }],
          users: [{ $match: { userId: { $ne: null } } }, { $group: { _id: "$userId" } }, { $count: "n" }],
          links: [{ $match: { url: { $ne: null } } }, { $group: { _id: "$url" } }, { $count: "n" }],
        } },
      ]);
      res.json({ items: result.items, total: result.total[0]?.n ?? 0, users: result.users[0]?.n ?? 0, links: result.links[0]?.n ?? 0 });
    } catch (error) {
      logger.error("Could not load failed requests", { error });
      res.status(500).end();
    }
  });

  router.get("/api/speed", requireAdminAuth, async (_req, res) => {
    try {
      const now = Date.now();
      const cursor = requestHistory().find({ measuredAt: { $gte: new Date(now - 86400000), $lte: new Date(now) }, outcome: "success" },
        { projection: { metrics: 1, platform: 1, mode: 1, key: 1 } });
      res.json(await speedReport(cursor));
    } catch (error) {
      logger.error("Could not load speed report", { error });
      res.status(500).end();
    }
  });

  router.get("/api/requests", requireAdminAuth, async (req, res) => {
    const userId = Number(req.query.userId);
    const exact = req.query.id === undefined ? undefined : Number(req.query.id);
    const before = req.query.before === undefined ? undefined : Number(req.query.before);
    if (!Number.isSafeInteger(userId) || userId <= 0 || (exact !== undefined && !Number.isSafeInteger(exact)) || (before !== undefined && !Number.isSafeInteger(before))) {
      res.status(400).json({ error: "Noto‘g‘ri parametr" });
      return;
    }
    try {
      const rows = await requestHistory().find({
        key: userId, url: { $exists: true }, ...(before !== undefined && { _id: { $lt: before } }), ...(exact !== undefined && { _id: exact }),
      }, { projection: { _id: 1, url: 1, outcome: 1, receivedAt: 1, startedAt: 1, state: 1, notice: 1, noticeAt: 1, acceptedNoticeAt: 1, acceptedNotice: 1, events: 1 } })
        .sort({ _id: -1 }).limit(21).toArray();
      res.json({ items: rows.slice(0, 20), more: rows.length > 20 });
    } catch (error) {
      logger.error("Could not load request history", { error });
      res.status(500).json({ error: "Tarixni yuklab bo‘lmadi" });
    }
  });

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
  router.get("/api/events", requireAdminAuth, (req: Request, res: Response) => {
    const streams = sessions.get(tokenFor(req)!)!;
    streams.add(res);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const sendUpdate = () => {
      const data = JSON.stringify({
        active: activeTasks.getActiveTasks(),
        recent: activeTasks.getRecentCompleted(),
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

    res.on("close", () => {
      streams.delete(res);
      clearInterval(heartbeat);
      activeTasks.removeListener("change", onChange);
      res.end();
    });
  });

  return router;
};
