import mongoose, { Document } from "mongoose";

export interface IForward extends Document {
  user: mongoose.Types.ObjectId;
  chatId: number;
  messageId: number; // The new copied message ID
  download: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}
