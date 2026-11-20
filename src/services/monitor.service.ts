import { statfs } from "node:fs/promises";
import mongoose from "mongoose";
import type { Telegram } from "telegraf";
import { config } from "@/config/config";
import logger from "@/config/logger";
import DeliveryAttempt from "@/models/DeliveryAttempt";
import { cleanupService } from "./cleanup.service";

const CHECK_EVERY_MS = 5 * 60 * 1000;
const WINDOW_MS = 15 * 60 * 1000;
const ALERT_COOLDOWN_MS = 60 * 60 * 1000;
// Failures caused by the link itself, not by the bot
const USER_REASONS = ["private", "live", "too_large", "missing"];
const MIN_ATTEMPTS = 8;
const FAILURE_RATE = 0.6;
const MIN_FREE_BYTES = 2 * 1024 ** 3;
const MIN_FREE_RATIO = 0.1;
const MAX_QUEUED = 50;

/**
 * Sends the admin (ADMIN_CHAT_ID) a Telegram message when a platform keeps
 * failing (e.g. Instagram changed something), the disk is running out or
 * the queue piles up. Each alert repeats at most once an hour.
 */
class MonitorService {
  private timer: NodeJS.Timeout | null = null;
  private telegram: Telegram | null = null;
  private readonly lastAlert = new Map<string, number>();

  start(telegram: Telegram): void {
    if (!config.admin.chatId) {
      logger.info("ADMIN_CHAT_ID is not set, monitoring alerts are off");
      return;
    }
    this.telegram = telegram;
    this.timer = setInterval(() => void this.check(), CHECK_EVERY_MS);
    logger.info("Monitoring alerts started");
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async check(): Promise<void> {
    const results = await Promise.allSettled([this.checkFailures(), this.checkDisk(), this.checkQueue()]);
    for (const result of results) {
      if (result.status === "rejected") logger.error("Monitoring check failed", { error: result.reason });
    }
  }

  private async alert(key: string, text: string): Promise<void> {
    const now = Date.now();
    if (now - (this.lastAlert.get(key) ?? 0) < ALERT_COOLDOWN_MS) return;
    this.lastAlert.set(key, now);
    logger.warning("Monitoring alert", { key, text });
    await this.telegram?.sendMessage(config.admin.chatId, `⚠️ ${text}`).catch((error) => {
      logger.error("Could not send monitoring alert", { error });
    });
  }

  private async checkFailures(): Promise<void> {
    const rows = await DeliveryAttempt.aggregate<{ _id: string; total: number; failed: number }>([
      { $match: { finishedAt: { $gte: new Date(Date.now() - WINDOW_MS) }, outcome: { $in: ["success", "failed"] } } },
      { $group: {
        _id: "$platform",
        total: { $sum: { $cond: [{ $in: ["$reason", USER_REASONS] }, 0, 1] } },
        failed: { $sum: { $cond: [{ $and: [{ $eq: ["$outcome", "failed"] }, { $not: [{ $in: ["$reason", USER_REASONS] }] }] }, 1, 0] } },
      } },
    ]);
    for (const row of rows) {
      if (row.total >= MIN_ATTEMPTS && row.failed / row.total >= FAILURE_RATE) {
        const percent = Math.round((row.failed / row.total) * 100);
        await this.alert(`failures:${row._id}`,
          `${row._id}: oxirgi 15 daqiqada ${row.total} ta so‘rovdan ${row.failed} tasi (${percent}%) xato bilan tugadi. Manba o‘zgargan bo‘lishi mumkin.`);
      }
    }
  }

  private async checkDisk(): Promise<void> {
    const stats = await statfs(config.downloadDir).catch(() => statfs("."));
    const free = stats.bavail * stats.bsize;
    const total = stats.blocks * stats.bsize;
    if (free >= MIN_FREE_BYTES && free / total >= MIN_FREE_RATIO) return;
    await cleanupService.cleanup();
    const gb = (free / 1024 ** 3).toFixed(1);
    await this.alert("disk", `Diskda joy kam qoldi: ${gb} GB bo‘sh (${Math.round((free / total) * 100)}%). Eski yuklamalar tozalandi.`);
  }

  private async checkQueue(): Promise<void> {
    const queued = await mongoose.connection.collection("telegram_updates").countDocuments({ state: "queued" });
    if (queued >= MAX_QUEUED) {
      await this.alert("queue", `Navbatda ${queued} ta so‘rov kutmoqda. Bot yuklamani ulgurmayapti.`);
    }
  }
}

export const monitorService = new MonitorService();
