import { Context, Middleware } from "telegraf";
import User from "../models/User";
import { myDayjs } from "../utils/myDayjs";
import logger from "../config/logger";
import { userActivityCache } from "../utils/userActivityCache";

/**
 * Optimized middleware to track user activity with throttling and batching
 * - Throttles lastActiveAt updates (every 30 seconds)
 * - Always updates commands immediately (critical)
 * - Batches messageCount updates
 * - Reduces database writes significantly
 */
export const userActivityMiddleware: Middleware<Context> = async (
  ctx,
  next
): Promise<void> => {
  try {
    const user = ctx.from;
    const chat = ctx.chat;

    if (!user || user.is_bot) {
      await next();
      return;
    }

    const now = myDayjs().toDate();
    const userId = user.id;

    // Detect if this is a command
    let isCommand = false;
    let commandName: string | undefined;

    if (
      ctx.updateType === "message" &&
      ctx.message &&
      "text" in ctx.message &&
      ctx.message.text
    ) {
      const text = ctx.message.text;
      // Check if message starts with / or has bot_command entity
      if (text.startsWith("/")) {
        isCommand = true;
        commandName = text.split(" ")[0].replace("/", "").split("@")[0];
      } else if ("entities" in ctx.message && ctx.message.entities) {
        // Check for bot_command entity
        const commandEntity = ctx.message.entities.find(
          (e) => e.type === "bot_command"
        );
        if (
          commandEntity &&
          "offset" in commandEntity &&
          "length" in commandEntity
        ) {
          isCommand = true;
          commandName = text
            .substring(
              commandEntity.offset,
              commandEntity.offset + commandEntity.length
            )
            .replace("/", "")
            .split("@")[0];
        }
      }
    }

    // Check if we should update lastActiveAt (throttled - every 30 seconds)
    const shouldUpdateActivity = userActivityCache.shouldUpdateActivity(userId);

    // Always update commands immediately (critical data)
    // Also update if throttled time passed
    const shouldUpdateNow = isCommand || shouldUpdateActivity;

    if (shouldUpdateNow) {
      // Get pending updates from cache and clear them
      const pending = userActivityCache.getAndClearPending(userId);

      // Prepare update data
      const updateData: Record<string, unknown> = {
        telegramId: userId,
        username: user.username,
        firstName: user.first_name,
        lastName: user.last_name,
        languageCode: user.language_code,
        isBot: user.is_bot || false,
        isPremium: user.is_premium || false,
        chatId: chat?.id,
        chatType: chat?.type || "private",
        isActive: true,
        $inc: {
          messageCount: (pending?.messageCount || 0) + 1,
          commandCount: pending?.commandCount || 0,
        },
      };

      // Update lastActiveAt only if throttled time passed
      if (shouldUpdateActivity) {
        updateData.lastActiveAt = now;
        userActivityCache.updateLastActivity(userId);
      }

      // Always update command info if it's a command (critical - update immediately)
      if (isCommand && commandName) {
        updateData.lastCommand = commandName;
        updateData.lastCommandAt = now;
        updateData.$inc = {
          messageCount: (pending?.messageCount || 0) + 1,
          commandCount: (pending?.commandCount || 0) + 1,
        };
      }

      // Update user in database (non-blocking)
      User.findOneAndUpdate(
        { telegramId: userId },
        {
          ...updateData,
          $setOnInsert: { firstSeenAt: now },
        },
        { upsert: true, setDefaultsOnInsert: true }
      ).catch((error: unknown) => {
        logger.error("Error updating user activity", { error, userId });
        // Re-add pending updates if update failed
        if (pending) {
          userActivityCache.addPendingUpdate(userId, pending);
        }
      });
    } else {
      // Just add to cache, don't write to DB yet (throttled)
      userActivityCache.addPendingUpdate(userId, {
        messageCount: 1,
      });
    }

    await next();
  } catch (error) {
    logger.error("Error in userActivityMiddleware", { error });
    // Continue even if middleware fails
    await next();
  }
};
