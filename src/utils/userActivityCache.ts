import { myDayjs } from "./myDayjs";
import User from "@/models/User";
import logger from "@/config/logger";
import type { Types } from "mongoose";

interface UserActivityCache {
  lastUpdate: Date;
  mongoId?: Types.ObjectId;
  pendingUpdates: {
    messageCount: number;
    commandCount: number;
    lastCommand?: string;
    lastCommandAt?: Date;
  };
}

/**
 * In-memory cache to throttle user activity updates
 * Reduces database writes by batching updates
 */
class UserActivityCacheManager {
  private cache: Map<number, UserActivityCache> = new Map();
  private readonly THROTTLE_MS = 30000; // 30 seconds - only update lastActiveAt every 30s
  private readonly CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour - TTL for cache entries
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Start periodic cleanup (every 5 minutes)
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpired();
    }, 5 * 60 * 1000); // 5 minutes
  }

  /**
   * Clean up expired cache entries
   */
  private cleanupExpired(): void {
    const now = myDayjs();
    for (const [userId, cached] of this.cache.entries()) {
      const age = now.diff(cached.lastUpdate, "ms");
      if (age > this.CACHE_TTL_MS) {
        const { messageCount, commandCount, lastCommand, lastCommandAt } =
          cached.pendingUpdates;
        if (messageCount > 0 || commandCount > 0) {
          const update: Record<string, unknown> = {
            $inc: { messageCount, commandCount },
          };
          if (lastCommand) {
            update.lastCommand = lastCommand;
            update.lastCommandAt = lastCommandAt;
          }
          User.updateOne({ telegramId: userId }, update).catch((err) => {
            logger.error("Failed to flush expired user activity", {
              userId,
              error: err,
            });
          });
        }
        this.cache.delete(userId);
      }
    }
  }

  /**
   * Check if we should update lastActiveAt (throttled)
   */
  shouldUpdateActivity(userId: number): boolean {
    const cached = this.cache.get(userId);
    if (!cached) {
      return true; // First time, always update
    }

    const timeSinceUpdate = myDayjs().diff(cached.lastUpdate, "ms");
    return timeSinceUpdate >= this.THROTTLE_MS;
  }

  /**
   * Add pending update to cache
   */
  addPendingUpdate(
    userId: number,
    update: {
      messageCount?: number;
      commandCount?: number;
      lastCommand?: string;
      lastCommandAt?: Date;
    }
  ): void {
    const cached = this.cache.get(userId) || {
      lastUpdate: myDayjs().toDate(),
      pendingUpdates: {
        messageCount: 0,
        commandCount: 0,
      },
    };

    if (update.messageCount) {
      cached.pendingUpdates.messageCount += update.messageCount;
    }
    if (update.commandCount) {
      cached.pendingUpdates.commandCount += update.commandCount;
    }
    if (update.lastCommand) {
      cached.pendingUpdates.lastCommand = update.lastCommand;
      cached.pendingUpdates.lastCommandAt = update.lastCommandAt;
    }

    this.cache.set(userId, cached);
  }

  /**
   * Get and clear pending updates for a user
   */
  getAndClearPending(
    userId: number
  ): UserActivityCache["pendingUpdates"] | null {
    const cached = this.cache.get(userId);
    if (!cached) {
      return null;
    }

    const pending = { ...cached.pendingUpdates };

    // Reset counters but keep lastUpdate for throttling
    cached.pendingUpdates = {
      messageCount: 0,
      commandCount: 0,
    };
    cached.lastUpdate = myDayjs().toDate();

    return pending;
  }

  /**
   * Update last update time (for throttling)
   */
  updateLastActivity(userId: number): void {
    const cached = this.cache.get(userId) || {
      lastUpdate: myDayjs().toDate(),
      pendingUpdates: {
        messageCount: 0,
        commandCount: 0,
      },
    };
    cached.lastUpdate = myDayjs().toDate();
    this.cache.set(userId, cached);
  }

  /** The user's Mongo _id never changes, so keep it with the throttle entry. */
  getMongoId(userId: number): Types.ObjectId | undefined {
    return this.cache.get(userId)?.mongoId;
  }

  setMongoId(userId: number, mongoId: Types.ObjectId): void {
    const cached = this.cache.get(userId);
    if (cached) cached.mongoId = mongoId;
  }

  /**
   * Clear cache for a user (e.g., after successful update)
   */
  clear(userId: number): void {
    this.cache.delete(userId);
  }

  /**
   * Get cache size (for monitoring)
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Clear all cache (for cleanup)
   */
  clearAll(): void {
    this.cache.clear();
  }

  /**
   * Flush all pending updates to database
   */
  async flushPending(): Promise<void> {
    const promises: Promise<unknown>[] = [];
    for (const [userId, cached] of this.cache.entries()) {
      const { messageCount, commandCount, lastCommand, lastCommandAt } =
        cached.pendingUpdates;
      if (messageCount > 0 || commandCount > 0) {
        const update: Record<string, unknown> = {
          $inc: { messageCount, commandCount },
        };
        if (lastCommand) {
          update.lastCommand = lastCommand;
          update.lastCommandAt = lastCommandAt;
        }
        promises.push(
          User.updateOne({ telegramId: userId }, update).catch((err) => {
            logger.error("Failed to flush pending user activity", {
              userId,
              error: err,
            });
          })
        );
      }
    }
    await Promise.all(promises);
    this.cache.clear();
  }

  /**
   * Stop cleanup interval (for graceful shutdown)
   */
  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

export const userActivityCache = new UserActivityCacheManager();
