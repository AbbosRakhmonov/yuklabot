import { Schema } from "mongoose";
import { ITiktokDownload } from "@/interfaces/ITiktokDownload";
import { EPlatform } from "@/enums/EPlatform";
import DownloadModel from "./Download";

// TikTok-specific fields schema (no extra fields needed)
const TiktokDownloadSchema: Schema = new Schema<ITiktokDownload>({});

export default DownloadModel.discriminator<ITiktokDownload>(
  EPlatform.TIKTOK,
  TiktokDownloadSchema
);
