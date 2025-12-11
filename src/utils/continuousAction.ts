import { Context } from "telegraf";
import { BotActionType } from "./botActions";
import logger from "../config/logger";

/**
 * Manages continuous bot actions with interval control
 * Automatically sends action at intervals and can be stopped/replaced
 */
class ContinuousActionManager {
  private intervals: Map<number, NodeJS.Timeout> = new Map();
  private readonly DEFAULT_INTERVAL_MS = 5000; // 5 seconds (Telegram requires action every 5s)

  /**
   * Start sending continuous action
   * @param ctx - Telegraf context
   * @param action - Action type to send
   * @param intervalMs - Interval in milliseconds (default: 5000)
   * @returns Function to stop the action
   */
  start(
    ctx: Context,
    action: BotActionType = "typing",
    intervalMs: number = this.DEFAULT_INTERVAL_MS
  ): () => void {
    const chatId = ctx.chat?.id;
    if (!chatId) {
      logger.warn("Cannot start continuous action: no chat ID");
      return () => {}; // Return no-op function
    }

    // Stop any existing action for this chat
    this.stop(chatId);

    // Send action immediately
    ctx.sendChatAction(action).catch((error: unknown) => {
      logger.error("Error sending initial chat action", { error, chatId });
    });

    // Set up interval to send action repeatedly
    const interval = setInterval(() => {
      ctx.sendChatAction(action).catch((error: unknown) => {
        logger.error("Error sending continuous chat action", { error, chatId });
        // Stop on error
        this.stop(chatId);
      });
    }, intervalMs);

    // Store interval
    this.intervals.set(chatId, interval);

    // Return stop function
    return () => this.stop(chatId);
  }

  /**
   * Stop continuous action for a chat
   * @param chatId - Chat ID to stop action for
   */
  stop(chatId: number): void {
    const interval = this.intervals.get(chatId);
    if (interval) {
      clearInterval(interval);
      this.intervals.delete(chatId);
    }
  }

  /**
   * Stop all continuous actions
   */
  stopAll(): void {
    this.intervals.forEach((interval) => {
      clearInterval(interval);
    });
    this.intervals.clear();
  }

  /**
   * Check if action is running for a chat
   */
  isRunning(chatId: number): boolean {
    return this.intervals.has(chatId);
  }

  /**
   * Get number of active continuous actions
   */
  size(): number {
    return this.intervals.size;
  }
}

export const continuousAction = new ContinuousActionManager();

/**
 * Helper function to start continuous action and get stop function
 * @param ctx - Telegraf context
 * @param action - Action type (default: "typing")
 * @param intervalMs - Interval in milliseconds (default: 5000)
 * @returns Function to stop the action
 */
export function startContinuousAction(
  ctx: Context,
  action: BotActionType = "typing",
  intervalMs?: number
): () => void {
  return continuousAction.start(ctx, action, intervalMs);
}

/**
 * Helper function to stop continuous action for a chat
 * @param ctx - Telegraf context
 */
export function stopContinuousAction(ctx: Context): void {
  const chatId = ctx.chat?.id;
  if (chatId) {
    continuousAction.stop(chatId);
  }
}
