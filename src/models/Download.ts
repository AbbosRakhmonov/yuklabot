import mongoose, { Schema } from "mongoose";
import { IDownload } from "../interfaces/IDownload";
import { EPlatform } from "../enums/EPlatform";
import { EMediaType } from "../enums/EMediaType";

export const DownloadSchema: Schema = new Schema<IDownload>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    chatId: {
      type: Number,
      required: true,
      index: true,
    },
    url: {
      type: String,
      required: true,
    },
    messageId: {
      type: Number,
      required: true,
    },
    platform: {
      type: String,
      enum: EPlatform,
      required: true,
    },
    // Telegram file_id: a short text reference, the file itself stays on
    // Telegram. Fallback when the cached message can't be copied anymore.
    fileId: String,
    fileName: String,
    fileSize: Number,
    mediaType: {
      type: String,
      enum: EMediaType,
      required: true,
    },
  },
  {
    timestamps: true,
    discriminatorKey: "platform",
  }
);

// Cache lookup in findAndSendMedia
DownloadSchema.index({ url: 1, platform: 1, mediaType: 1, createdAt: -1 });

export default mongoose.model<IDownload>("Download", DownloadSchema);
