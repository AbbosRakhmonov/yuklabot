import { myDayjs } from "./myDayjs";

interface UserActivityCache {
  lastUpdate: Date;
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
}

export const userActivityCache = new UserActivityCacheManager();
