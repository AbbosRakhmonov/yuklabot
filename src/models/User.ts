import mongoose, { Schema } from "mongoose";
import { IUser } from "../interfaces/IUser";

const UserSchema: Schema = new Schema(
  {
    // Basic Telegram user info
    telegramId: {
      type: Number,
      required: true,
      unique: true,
      index: true,
    },
    username: {
      type: String,
      sparse: true,
      index: true,
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
      index: true,
    },
    isPremium: {
      type: Boolean,
      default: false,
    },

    // Chat information
    chatId: {
      type: Number,
      index: true,
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
      index: true,
    },
    isBlocked: {
      type: Boolean,
      default: false,
      index: true,
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
      index: true,
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

// Indexes for common queries
UserSchema.index({ isActive: 1, lastActiveAt: -1 });
UserSchema.index({ createdAt: -1 });
UserSchema.index({ messageCount: -1 });

export default mongoose.model<IUser>("User", UserSchema);
