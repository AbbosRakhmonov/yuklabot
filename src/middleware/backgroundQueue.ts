import { Context, Telegraf } from "telegraf";
import type { Update } from "telegraf/types";
import mongoose from "mongoose";
import { setTimeout as delay } from "node:timers/promises";
import type { IMyContext } from "@/interfaces/IMyContext";
import { CANCEL_DOWNLOAD_REGEX } from "@/utils/downloadCancel";
import { MESSAGES } from "@/constants";
import logger from "@/config/logger";
import { Semaphore } from "@/utils/processManager";
import { extractSupportedUrl } from "@/helpers/extractSupportedUrl";

import { requestUrl, queueTiming } from "@/utils/requestHistory";

interface Job {
  url?: string;
  outcome?: string;
  notice?: string;
  noticeAt?: Date;
  acceptedNoticeAt?: Date;
  acceptedNotice?: string;
  startedAt?: Date;
  _id: number;
  key: number;
  state: "queued" | "running" | "done";
  update?: Update;
  noticeId?: number;
  receivedAt?: Date;
  expiresAt?: Date;
}
const retentionMs = 48 * 60 * 60 * 1000;

// One bot worker per database, matching the PM2 deployment.
export class UpdateQueue {
  private readonly workers = new Set<number>();
  private readonly admissions = new Map<number, Promise<void>>();
  private readonly admissionSlots = new Semaphore(6);
  private stopped = false;

  constructor(private readonly bot: Telegraf<IMyContext>,
    private readonly jobs = mongoose.connection.collection<Job>("telegram_updates")) {}

  async start(): Promise<void> {
    await this.jobs.createIndex({ state: 1, key: 1, _id: 1 });
    await this.jobs.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    await this.jobs.createIndex({ key: 1, _id: -1 }, { partialFilterExpression: { url: { $exists: true } } });
    await this.jobs.createIndex({ measuredAt: 1 }, { sparse: true });
    // A running handler may already have sent media before a crash.
    for await (const job of this.jobs.find({ state: "running" })) {
      if (job.update) {
        const ctx = this.context(job.update);
        if (ctx.chat) await ctx.reply("Bot qayta ishga tushdi. Javob kelmagan bo‘lsa, havolani qayta yuboring.").catch(() => {});
      }
      if (job.url) await this.jobs.updateOne({ _id: job._id, outcome: { $exists: false } }, { $set: { outcome: "interrupted" } });
      await this.finish(job._id);
    }
    void this.scan();
  }

  stop(): void { this.stopped = true; }

  private context(update: Update) {
    return new Context(update, this.bot.telegram, this.bot.botInfo!);
  }

  // A failed write also rejects later pending admissions for that user.
  // Telegram can then retry them in order without skipping the failed update.
  accept(update: Update): Promise<void> {
    const ctx = this.context(update);
    // Inline answers expire in seconds and only read the cache: never wait behind a download
    if ("inline_query" in update ||
      ctx.callbackQuery && "data" in ctx.callbackQuery && CANCEL_DOWNLOAD_REGEX.test(ctx.callbackQuery.data)) {
      return this.bot.handleUpdate(update);
    }
    const key = ctx.from?.id ?? ctx.chat?.id ?? update.update_id;
    const receivedAt = new Date();
    const previous = this.admissions.get(key) ?? Promise.resolve();
    const enqueue = previous.then(async () => {
      if (!(await this.admitGroupMessage(ctx))) return;
      const release = await this.admissionSlots.acquire();
      try {
        await this.persist(ctx, key, update, receivedAt);
      } finally {
        release();
      }
    }).finally(() => {
      if (this.admissions.get(key) === enqueue) this.admissions.delete(key);
    });
    this.admissions.set(key, enqueue);
    return enqueue;
  }

  /**
   * In groups the bot sees ordinary chatter: only commands and messages with a
   * supported link get in, and the link becomes the whole text, so the rest of
   * the bot handles it exactly like a link sent in private.
   */
  private async admitGroupMessage(ctx: Context): Promise<boolean> {
    const type = ctx.chat?.type;
    if (type !== "group" && type !== "supergroup") return true;
    const message = ctx.message;
    if (!message) return !("edited_message" in ctx.update);
    if (!("text" in message)) return false;
    if (message.text.startsWith("/")) return true;
    const url = await extractSupportedUrl(message.text);
    if (!url) return false;
    Object.assign(message, { text: url, entities: undefined });
    return true;
  }

  private async persist(ctx: Context, key: number, update: Update, receivedAt: Date): Promise<void> {
    if (this.stopped) throw new Error("Queue is stopping");
    if (await this.jobs.findOne({ _id: update.update_id }, { projection: { _id: 1 } })) return;
    const size = await this.jobs.countDocuments({ key, state: { $in: ["queued", "running"] } });
    const url = ctx.message && "text" in ctx.message ? requestUrl(ctx.message.text) : undefined;
    const history = url ? { url, receivedAt } : {};
    if (size >= 5) {
      await this.jobs.insertOne({ _id: update.update_id, key, ...history, ...(url && { outcome: "queue_full" }), state: "done", expiresAt: new Date(Date.now() + retentionMs) });
      const notify = ctx.callbackQuery ? ctx.answerCbQuery(MESSAGES.ERROR.QUEUE_FULL)
        : ctx.chat ? ctx.reply(MESSAGES.ERROR.QUEUE_FULL) : undefined;
      void notify?.then(async () => { if (url) await this.saveNotice(update.update_id, MESSAGES.ERROR.QUEUE_FULL); }).catch(() => {});
      return;
    }
    await this.jobs.insertOne({ _id: update.update_id, key, ...history, state: "queued", update, receivedAt });
    if (size && ctx.message && "text" in ctx.message && /^https?:\/\//i.test(ctx.message.text)) {
      void this.notifyWaiting(ctx, update.update_id).catch(error => logger.warning("Queue notice failed", { error }));
    }
    this.wake(key);
  }

  private async saveNotice(id: number, notice: string) {
    await this.jobs.updateOne({ _id: id }, { $set: { notice, noticeAt: new Date() } });
  }

  private async notifyWaiting(ctx: Context, id: number): Promise<void> {
    const message = await ctx.reply("Havolangiz navbatda. Oldingi so‘rov tugagach boshlanadi.");
    await this.saveNotice(id, message.text);
    const result = await this.jobs.updateOne({ _id: id, state: "queued" }, { $set: { noticeId: message.message_id } });
    if (!result.matchedCount) await ctx.telegram.deleteMessage(message.chat.id, message.message_id).catch(() => {});
  }

  private async scan(): Promise<void> {
    while (!this.stopped) {
      try {
        for (const key of await this.jobs.distinct("key", { state: "queued" })) this.wake(key);
      } catch (error) { logger.error("Queue scan failed", { error }); }
      await delay(1000);
    }
  }

  private wake(key: number): void {
    if (this.workers.has(key) || this.stopped) return;
    this.workers.add(key);
    void this.drain(key).catch(error => logger.error("Queue worker failed", { error }))
      .finally(() => this.workers.delete(key));
  }

  private async finish(id: number): Promise<void> {
    await this.jobs.updateOne({ _id: id }, {
      $set: { state: "done", expiresAt: new Date(Date.now() + retentionMs) },
      $unset: { update: "" },
    });
  }

  private async drain(key: number): Promise<void> {
    while (!this.stopped) {
      const job = await this.jobs.findOneAndUpdate({ key, state: "queued" }, { $set: { state: "running", startedAt: new Date() } },
        { sort: { _id: 1 }, returnDocument: "after" });
      if (!job?.update) return;
      const startedAt = Date.now();
      if (job.noticeId) {
        const chat = this.context(job.update).chat;
        if (chat) {
          // This edit may land after a fast cached delivery. Describe the transition.
          const acceptedNotice = "Navbatdagi havolangizni tekshirish boshlandi.";
          void this.bot.telegram.editMessageText(chat.id, job.noticeId, undefined, acceptedNotice)
            .then(() => this.jobs.updateOne({ _id: job._id }, { $set: { acceptedNotice, acceptedNoticeAt: new Date() } }))
            .catch(error => logger.warning("Could not update queue notice", { updateId: job._id, error }));
        }
      }
      const update = job.update;
      await queueTiming.run({ received: job.receivedAt?.getTime() ?? startedAt, started: job.startedAt?.getTime() ?? startedAt },
        () => this.bot.handleUpdate(update));
      if (job.receivedAt) {
        logger.info("Telegram update timing", {
          updateId: job._id,
          queuedMs: startedAt - job.receivedAt.getTime(),
          handlerMs: Date.now() - startedAt,
        });
      }
      await this.finish(job._id);
    }
  }

  async poll(): Promise<void> {
    await this.bot.telegram.deleteWebhook({ drop_pending_updates: false });
    let offset = 0;
    while (!this.stopped) {
      try {
        const updates = await this.bot.telegram.getUpdates(30, 100, offset, []);
        if (updates.length) {
          const results = await Promise.allSettled(updates.map(update => this.accept(update)));
          const failed = results.find(result => result.status === "rejected");
          if (failed?.status === "rejected") throw failed.reason;
          offset = updates[updates.length - 1].update_id + 1;
        }
      } catch (error) {
        logger.error("Could not receive or persist Telegram update", { error });
        await delay(3000);
      }
    }
  }
}
