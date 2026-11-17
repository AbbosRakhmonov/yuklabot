import { IDownload } from "@/interfaces/IDownload";
import { ICarouselItem } from "@/interfaces/IInstagramDownload";

export interface IYoutubeDownload extends IDownload {
  height: number; // 0 for audio
  formatId?: string; // audio: chosen yt-dlp format id
  carousel?: ICarouselItem[]; // video sent in parts
}
