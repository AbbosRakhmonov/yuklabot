import { EMediaType } from "@/enums/EMediaType";
import { IBaseState } from "@/interfaces/IBaseState";
import { IYoutubeData } from "@/interfaces/IYoutubeData";
import { YoutubeService } from "@/services";

export interface IYouTubeState extends IBaseState {
  data: IYoutubeData;
  type: Extract<EMediaType, "audio" | "video">;
  service: YoutubeService;
}
