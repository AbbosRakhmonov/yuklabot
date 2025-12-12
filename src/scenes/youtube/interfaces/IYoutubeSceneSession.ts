import { EMediaType } from "@/enums/EMediaType";
import { IBaseSession } from "@/interfaces/IBaseSession";
import { IYoutubeData } from "@/interfaces/IYoutubeData";
import { YoutubeService } from "@/services";

export interface YouTubeSceneSession extends IBaseSession {
  data: IYoutubeData;
  type: Extract<EMediaType, "audio" | "video">;
  service: YoutubeService;
}
