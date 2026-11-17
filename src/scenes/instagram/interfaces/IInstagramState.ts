import { IBaseState } from "@/interfaces/IBaseState";
import { IInstagramData } from "@/interfaces/IInstagramData";
import { InstagramService } from "@/services";

export interface IInstagramState extends IBaseState {
  // After a session round-trip only its fields are left (url, data, proxyId)
  service: InstagramService;
  data: IInstagramData;
}
