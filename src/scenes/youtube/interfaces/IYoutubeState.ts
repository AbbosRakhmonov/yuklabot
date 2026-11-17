import { IBaseState } from "@/interfaces/IBaseState";
import { IYoutubeServiceState } from "@/services/youtube.service";

export interface IYouTubeState extends IBaseState {
  service: IYoutubeServiceState;
}
