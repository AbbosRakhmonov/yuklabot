import { Markup, TelegramError } from "telegraf";
import type { Telegram } from "telegraf";
import { setTimeout as delay } from "node:timers/promises";
import { IMyContext } from "@/interfaces/IMyContext";
import { config } from "@/config/config";
import logger from "@/config/logger";
import User from "@/models/User";

export const BROADCAST_CALLBACK_REGEX = /^bc:(yes|no)(?::(\d+))?$/;
// Telegram allows about 30 messages a second to different chats
const SEND_INTERVAL_MS = 40;
const PROGRESS_EVERY = 500;

let running = false;
const recipientFilter = { isBlocked: { $ne: true } };

const isAdmin = (ctx: IMyContext) => ctx.from?.id === config.admin.chatId && ctx.chat?.type === "private";

/**
 * Admin replies to any message (text, photo, video...) with /broadcast;
 * after confirmation it is copied to every user who hasn't blocked the bot.
 */
export const broadcastCommand = async (ctx: IMyContext): Promise<void> => {
  if (!isAdmin(ctx)) return;
  const source = ctx.message && "reply_to_message" in ctx.message ? ctx.message.reply_to_message : undefined;
  if (!source) {
    await ctx.reply("Yubormoqchi bo‘lgan xabarga reply qilib /broadcast yozing.");
    return;
  }
  if (running) {
    await ctx.reply("Boshqa xabar hali yuborilmoqda, tugashini kuting.");
    return;
  }
  const count = await User.countDocuments(recipientFilter);
  await ctx.reply(`Bu xabar ${count} ta foydalanuvchiga yuboriladi. Tasdiqlaysizmi?`, {
    reply_parameters: { message_id: source.message_id },
    ...Markup.inlineKeyboard([
      Markup.button.callback("✅ Yuborish", `bc:yes:${source.message_id}`),
      Markup.button.callback("❌ Bekor qilish", "bc:no"),
    ]),
  });
};

export const handleBroadcastButton = async (ctx: IMyContext): Promise<void> => {
  const data = ctx.callbackQuery && "data" in ctx.callbackQuery ? ctx.callbackQuery.data : "";
  const match = BROADCAST_CALLBACK_REGEX.exec(data);
  if (!isAdmin(ctx) || !match) {
    await ctx.answerCbQuery().catch(() => {});
    return;
  }
  await ctx.answerCbQuery().catch(() => {});
  if (match[1] === "no" || !match[2]) {
    await ctx.editMessageText("Bekor qilindi.").catch(() => {});
    return;
  }
  if (running) {
    await ctx.editMessageText("Boshqa xabar hali yuborilmoqda.").catch(() => {});
    return;
  }
  const status = await ctx.editMessageText("📤 Yuborish boshlandi...");
  const statusId = typeof status === "object" ? status.message_id : ctx.callbackQuery?.message?.message_id;
  // Runs in the background: it takes minutes and must not hold the admin's queue
  void runBroadcast(ctx.telegram, ctx.chat!.id, Number(match[2]), statusId)
    .catch((error) => logger.error("Broadcast failed", { error }));
};

async function runBroadcast(telegram: Telegram, adminChat: number, messageId: number, statusId?: number) {
  running = true;
  let sent = 0, blocked = 0, failed = 0;
  const report = (done: boolean) => {
    const text = `${done ? "✅ Tugadi" : "📤 Yuborilmoqda"}\nYuborildi: ${sent}\nBlok qilgan: ${blocked}\nXato: ${failed}`;
    return statusId
      ? telegram.editMessageText(adminChat, statusId, undefined, text).catch(() => {})
      : telegram.sendMessage(adminChat, text).catch(() => {});
  };
  try {
    const users = User.find(recipientFilter, { telegramId: 1 }).lean().cursor();
    for await (const user of users) {
      for (;;) {
        try {
          await telegram.copyMessage(user.telegramId, adminChat, messageId);
          sent++;
        } catch (error) {
          if (error instanceof TelegramError && error.code === 429) {
            await delay(((error.parameters?.retry_after ?? 5) + 1) * 1000);
            continue;
          }
          // 400 only for a gone chat: "message to copy not found" must not mark everyone blocked
          if (error instanceof TelegramError && (error.code === 403 || /chat not found/i.test(error.description))) {
            blocked++;
            await User.updateOne({ telegramId: user.telegramId }, { isBlocked: true, isActive: false });
          } else {
            failed++;
          }
        }
        break;
      }
      if ((sent + blocked + failed) % PROGRESS_EVERY === 0) await report(false);
      await delay(SEND_INTERVAL_MS);
    }
  } finally {
    running = false;
    await report(true);
    logger.info("Broadcast finished", { sent, blocked, failed });
  }
}
