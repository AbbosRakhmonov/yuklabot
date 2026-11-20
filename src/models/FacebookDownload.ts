import { Schema } from "mongoose";
import { IDownload } from "@/interfaces/IDownload";
import { ICarouselItem } from "@/interfaces/IInstagramDownload";
import { EPlatform } from "@/enums/EPlatform";
import DownloadModel from "./Download";
import { CarouselItemSchema } from "./CarouselItem";

export interface IFacebookDownload extends IDownload {
  carousel?: ICarouselItem[]; // Video over Telegram's limit, sent in parts
}

const FacebookDownloadSchema: Schema = new Schema<IFacebookDownload>({
  carousel: {
    type: [CarouselItemSchema],
    default: undefined,
  },
});

export default DownloadModel.discriminator<IFacebookDownload>(
  EPlatform.FACEBOOK,
  FacebookDownloadSchema
);
