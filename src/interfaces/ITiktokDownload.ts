import { IDownload } from "@/interfaces/IDownload";
import { ICarouselItem } from "@/interfaces/IInstagramDownload";

export interface ITiktokDownload extends IDownload {
  carousel?: ICarouselItem[]; // Photo posts: images + music messages
}
