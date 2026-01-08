import { IBaseState } from "@/interfaces/IBaseState";
import { TiktokService } from "@/services/tiktok.service";

export interface ITiktokState extends IBaseState {
  service: TiktokService;
}
