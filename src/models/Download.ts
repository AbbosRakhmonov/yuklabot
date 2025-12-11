import mongoose, { Schema } from "mongoose";
import { IDownload } from "../interfaces/IDownload";
import { EPlatform } from "../enums/EPlatform";
import { EDownloadStatus } from "../enums/EDownloadStatus";
import { EMediaType } from "../enums/EMediaType";

const DownloadSchema: Schema = new Schema(
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
    status: {
      type: String,
      enum: EDownloadStatus,
      required: true,
    },
    filePath: {
      type: String,
      required: true,
    },
    fileName: {
      type: String,
      required: true,
    },
    fileSize: {
      type: Number,
      required: true,
    },
    mediaType: {
      type: String,
      enum: EMediaType,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for common queries
DownloadSchema.index({ user: 1, chatId: 1, messageId: 1 });
DownloadSchema.index({ url: 1 });
DownloadSchema.index({ platform: 1 });
DownloadSchema.index({ status: 1 });
DownloadSchema.index({ mediaType: 1 });
DownloadSchema.index({ createdAt: -1 });

export default mongoose.model<IDownload>("Download", DownloadSchema);
