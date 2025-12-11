import { Document } from "mongoose";
import { IUser } from "./IUser";
import { EDownloadStatus } from "../enums/EDownloadStatus";
import { EPlatform } from "../enums/EPlatform";
import { EMediaType } from "../enums/EMediaType";

export interface IDownload extends Document {
  user: IUser;
  url: string;
  chatId: number;
  messageId: number;
  platform: EPlatform;
  status: EDownloadStatus;
  filePath: string;
  fileName: string;
  fileSize: number;
  mediaType: EMediaType;
  createdAt: Date;
  updatedAt: Date;
}
