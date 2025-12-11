import { Document } from "mongoose";

export interface IUser extends Document {
  // Basic Telegram user info
  telegramId: number;
  username?: string;
  firstName?: string;
  lastName?: string;
  languageCode?: string;
  isBot: boolean;
  isPremium?: boolean;

  // Chat information
  chatId?: number; // For direct messaging
  chatType?: "private" | "group" | "supergroup" | "channel";

  // User status and activity
  isActive: boolean;
  isBlocked: boolean;
  lastActiveAt?: Date;
  firstSeenAt?: Date;

  // Statistics
  messageCount: number;
  commandCount: number;
  lastCommand?: string;
  lastCommandAt?: Date;

  // User preferences and settings
  settings?: {
    language?: string;
    notifications?: boolean;
    timezone?: string;
    [key: string]: unknown;
  };

  // Referral and source tracking
  referredBy?: number; // telegramId of referrer
  source?: string; // How they found the bot (e.g., "start_link", "inline", "group")

  // Metadata
  metadata?: {
    [key: string]: unknown;
  };

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}
