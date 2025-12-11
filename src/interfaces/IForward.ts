import { Document } from "mongoose";
import { IUser } from "./IUser";
import { IDownload } from "./IDownload";

export interface IForward extends Document {
  user: IUser;
  chatId: number;
  messageId: number;
  download: IDownload;
  createdAt: Date;
  updatedAt: Date;
}
