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
    discriminatorKey: "platform",
  }
);

export default mongoose.model<IDownload>("Download", DownloadSchema);
