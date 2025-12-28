import { IBaseState } from "@/interfaces/IBaseState";
import { YoutubeService } from "@/services";

export interface IYouTubeState extends IBaseState {
  service: YoutubeService;
}
