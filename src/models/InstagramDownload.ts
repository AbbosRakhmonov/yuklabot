import { Schema } from "mongoose";
import { IInstagramDownload } from "@/interfaces/IInstagramDownload";
import { EPlatform } from "@/enums/EPlatform";
import DownloadModel from "./Download";

// Carousel item schema
const CarouselItemSchema = new Schema(
  {
    messageId: { type: Number, required: true },
    itemId: { type: String, required: true },
    mediaType: { type: String, required: true },
  },
  { _id: false }
);

// Instagram-specific fields schema
const InstagramDownloadSchema: Schema = new Schema<IInstagramDownload>({
  carousel: {
    type: [CarouselItemSchema],
    default: undefined, // Only set for carousel posts
  },
});

export default DownloadModel.discriminator<IInstagramDownload>(
  EPlatform.INSTAGRAM,
  InstagramDownloadSchema
);

