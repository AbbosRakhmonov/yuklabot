import mongoose, { Schema } from "mongoose";
import { IUser } from "../interfaces/IUser";

const UserSchema: Schema = new Schema(
  {
    // Basic Telegram user info
    telegramId: {
      type: Number,
      required: true,
      unique: true,
    },
    username: {
      type: String,
    },
    firstName: {
      type: String,
    },
    lastName: {
      type: String,
    },
    languageCode: {
      type: String,
      default: "en",
    },
    isBot: {
      type: Boolean,
      default: false,
    },
    isPremium: {
      type: Boolean,
      default: false,
    },

    // Chat information
    chatId: {
      type: Number,
    },
    chatType: {
      type: String,
      enum: ["private", "group", "supergroup", "channel"],
      default: "private",
    },

    // User status and activity
    isActive: {
      type: Boolean,
      default: true,
    },
    isBlocked: {
      type: Boolean,
      default: false,
    },
    lastActiveAt: {
      type: Date,
      index: true,
    },
    firstSeenAt: {
      type: Date,
    },

    // Statistics
    messageCount: {
      type: Number,
      default: 0,
    },
    commandCount: {
      type: Number,
      default: 0,
    },
    lastCommand: {
      type: String,
    },
    lastCommandAt: {
      type: Date,
    },

    // User preferences and settings
    settings: {
      type: Schema.Types.Mixed,
      default: {},
    },

    // Referral and source tracking
    referredBy: {
      type: Number,
      ref: "User",
    },
    source: {
      type: String,
    },

    // Metadata for flexible data storage
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

// Only telegramId (unique) and lastActiveAt (dashboard sort, "active today") are queried.
// Every extra index is rewritten on each activity upsert.
const User = mongoose.model<IUser>("User", UserSchema);

const LEGACY_INDEXES = [
  "username_1", "isBot_1", "chatId_1", "isActive_1", "isBlocked_1", "referredBy_1",
  "isActive_1_lastActiveAt_-1", "createdAt_-1", "messageCount_-1",
];

export async function dropLegacyUserIndexes(): Promise<void> {
  const existing = new Set((await User.collection.indexes()).map(index => index.name));
  for (const name of LEGACY_INDEXES) {
    if (existing.has(name)) await User.collection.dropIndex(name);
  }
}

export default User;
