import { Schema } from "mongoose";
import { IInstagramDownload } from "@/interfaces/IInstagramDownload";
import { EPlatform } from "@/enums/EPlatform";
import DownloadModel from "./Download";
import { CarouselItemSchema } from "./CarouselItem";

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
