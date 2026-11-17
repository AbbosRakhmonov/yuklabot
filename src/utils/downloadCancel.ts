import { randomBytes } from "crypto";
import { Markup } from "telegraf";
import { CANCEL_BUTTON_TEXT } from "@/constants";
import { IMyContext } from "@/interfaces/IMyContext";

export const CANCEL_DOWNLOAD_PREFIX = "cancel_dl:";
export const CANCEL_DOWNLOAD_REGEX = /^cancel_dl:([a-f0-9]{16})$/;

interface CancellableEntry {
  controller: AbortController;
  userId?: number;
}

// Running downloads that can be cancelled, by token
const cancellables = new Map<string, CancellableEntry>();

export interface Cancellable {
  signal: AbortSignal;
  keyboard: ReturnType<typeof Markup.inlineKeyboard>["reply_markup"];
  unregister: () => void;
}

export const registerCancellable = (userId?: number): Cancellable => {
  const token = randomBytes(8).toString("hex");
  const controller = new AbortController();
  cancellables.set(token, { controller, userId });

  return {
    signal: controller.signal,
    keyboard: Markup.inlineKeyboard([
      Markup.button.callback(
        CANCEL_BUTTON_TEXT,
        `${CANCEL_DOWNLOAD_PREFIX}${token}`,
      ),
    ]).reply_markup,
    unregister: () => {
      cancellables.delete(token);
    },
  };
};

/**
 * ❌ button under a progress message.
 * Must be registered BEFORE the per-user background queue: the user's queue
 * is busy with the very download this button should stop.
 */
export const handleCancelDownload = async (ctx: IMyContext): Promise<void> => {
  const data =
    ctx.callbackQuery && "data" in ctx.callbackQuery
      ? ctx.callbackQuery.data
      : "";
  const token = CANCEL_DOWNLOAD_REGEX.exec(data)?.[1];
  const entry = token ? cancellables.get(token) : undefined;

  if (!entry) {
    await ctx.answerCbQuery("Yuklash allaqachon tugagan.").catch(() => {});
    return;
  }

  // In groups, only the user who started the download may cancel it
  if (entry.userId !== undefined && entry.userId !== ctx.from?.id) {
    await ctx.answerCbQuery("Bu sizning yuklashingiz emas.").catch(() => {});
    return;
  }

  entry.controller.abort();
  cancellables.delete(token as string);
  await ctx.answerCbQuery("Bekor qilinmoqda...").catch(() => {});
};
