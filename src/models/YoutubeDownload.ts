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

export default DownloadModel.discriminator<IYoutubeDownload>(
  EPlatform.YOUTUBE,
  YoutubeDownloadSchema
);
