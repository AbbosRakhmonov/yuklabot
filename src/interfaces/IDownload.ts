import mongoose, { Document } from "mongoose";
import { EPlatform } from "../enums/EPlatform";
import { EMediaType } from "../enums/EMediaType";

export interface IDownload extends Document {
  user: mongoose.Types.ObjectId;
  url: string;
  chatId: number;
  messageId: number;
  platform: EPlatform;
  fileName: string;
  fileSize: number;
  mediaType: EMediaType;
  createdAt: Date;
  updatedAt: Date;
}
