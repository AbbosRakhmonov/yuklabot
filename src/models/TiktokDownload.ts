import { Schema } from "mongoose";
import { ITiktokDownload } from "@/interfaces/ITiktokDownload";
import { EPlatform } from "@/enums/EPlatform";
import DownloadModel from "./Download";
import { CarouselItemSchema } from "./CarouselItem";

const TiktokDownloadSchema: Schema = new Schema<ITiktokDownload>({
  carousel: {
    type: [CarouselItemSchema],
    default: undefined, // Only set for photo posts (slideshows)
  },
});

export default DownloadModel.discriminator<ITiktokDownload>(
  EPlatform.TIKTOK,
  TiktokDownloadSchema
);
