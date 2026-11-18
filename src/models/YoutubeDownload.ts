import { Schema } from "mongoose";
import { IYoutubeDownload } from "@/interfaces/IYoutubeDownload";
import { EPlatform } from "@/enums/EPlatform";
import DownloadModel from "./Download";
import { CarouselItemSchema } from "./CarouselItem";

// YouTube-specific fields schema
const YoutubeDownloadSchema: Schema = new Schema<IYoutubeDownload>({
  height: {
    type: Number,
    required: true,
  },
  // Audio: the chosen yt-dlp format (each bitrate is cached separately)
  formatId: String,
  // Video over Telegram's limit, sent in parts
  carousel: {
    type: [CarouselItemSchema],
    default: undefined,
  },
});

YoutubeDownloadSchema.index({
  url: 1,
  platform: 1,
  mediaType: 1,
  height: 1,
  createdAt: -1,
});
YoutubeDownloadSchema.index({
  url: 1,
  platform: 1,
  mediaType: 1,
  formatId: 1,
  createdAt: -1,
});

export default DownloadModel.discriminator<IYoutubeDownload>(
  EPlatform.YOUTUBE,
  YoutubeDownloadSchema
);
