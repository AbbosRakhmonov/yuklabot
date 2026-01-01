import { Middleware } from "telegraf";
import { IMyContext } from "@/interfaces/IMyContext";
import logger from "@/config/logger";
import { myDayjs } from "@/utils/myDayjs";

interface RateLimitEntry {
  count: number;
  resetAt: Date;
}

/**
 * In-memory rate limiter for bot commands
 * Limits users to 10 requests per minute
 */
class RateLimiter {
  private cache: Map<number, RateLimitEntry> = new Map();
  private readonly MAX_REQUESTS = 10;
  private readonly WINDOW_MS = 60 * 1000; // 1 minute
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Clean up expired entries every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpired();
    }, 5 * 60 * 1000);
  }

  /**
   * Check if user has exceeded rate limit
   * @param userId - Telegram user ID
   * @returns true if rate limit exceeded, false otherwise
   */
  isRateLimited(userId: number): boolean {
    const now = myDayjs().toDate();
    const entry = this.cache.get(userId);

    if (!entry) {
      // First request, create entry
      this.cache.set(userId, {
        count: 1,
        resetAt: myDayjs().add(this.WINDOW_MS, "millisecond").toDate(),
      });
      return false;
    }

    // Check if window has expired
    if (now >= entry.resetAt) {
      // Reset window
      this.cache.set(userId, {
        count: 1,
        resetAt: myDayjs().add(this.WINDOW_MS, "millisecond").toDate(),
      });
      return false;
    }

    // Increment count
    entry.count++;

    // Check if limit exceeded
    if (entry.count > this.MAX_REQUESTS) {
      return true;
    }

    return false;
  }

  /**
   * Get remaining requests for a user
   */
  getRemaining(userId: number): number {
    const entry = this.cache.get(userId);
    if (!entry) {
      return this.MAX_REQUESTS;
    }

    const now = myDayjs().toDate();
    if (now >= entry.resetAt) {
      return this.MAX_REQUESTS;
    }

    return Math.max(0, this.MAX_REQUESTS - entry.count);
  }

  /**
   * Get reset time for a user
   */
  getResetTime(userId: number): Date | null {
    const entry = this.cache.get(userId);
    return entry ? entry.resetAt : null;
  }

  /**
   * Clean up expired entries
   */
  private cleanupExpired(): void {
    const now = myDayjs().toDate();
    for (const [userId, entry] of this.cache.entries()) {
      if (now >= entry.resetAt) {
        this.cache.delete(userId);
      }
    }
  }

  /**
   * Stop cleanup interval
   */
  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

const rateLimiter = new RateLimiter();

/**
 * Rate limiting middleware
 * Limits users to 10 requests per minute
 */
export const rateLimiterMiddleware: Middleware<IMyContext> = async (
  ctx,
  next
): Promise<void> => {
  const user = ctx.from;

  // Skip rate limiting for bots
  if (!user || user.is_bot) {
    await next();
    return;
  }

  const userId = user.id;

  // Check rate limit
  if (rateLimiter.isRateLimited(userId)) {
    const resetTime = rateLimiter.getResetTime(userId);
    const resetIn = resetTime
      ? Math.ceil(myDayjs().diff(resetTime, "seconds", true))
      : 60;

    logger.warning("Rate limit exceeded", {
      userId,
      resetIn,
    });

    await ctx.reply(
      `Rate limit exceeded. Please try again in ${resetIn} seconds.`
    );
    return;
  }

  await next();
};
