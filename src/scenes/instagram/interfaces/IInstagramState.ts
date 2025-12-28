import { IBaseState } from "@/interfaces/IBaseState";
import { IInstagramData } from "@/interfaces/IInstagramData";
import {
  IInstagramGalleryDlData,
  IGalleryDlJsonResponse,
} from "@/interfaces/IGalleryDlData";
import { InstagramService } from "@/services";

export interface IInstagramState extends IBaseState {
  service: InstagramService;
  data: IInstagramData;
  galleryDlData: IInstagramGalleryDlData | null;
  galleryDlRawData: IGalleryDlJsonResponse | null;
}
