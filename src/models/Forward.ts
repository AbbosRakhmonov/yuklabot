import mongoose, { Schema } from "mongoose";
import { IForward } from "../interfaces/IForward";

const ForwardSchema: Schema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    chatId: {
      type: Number,
      required: true,
      index: true,
    },
    messageId: {
      type: Number,
      required: true,
      index: true,
    },
    download: {
      type: Schema.Types.ObjectId,
      ref: "Download",
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for common queries
ForwardSchema.index({ user: 1, chatId: 1, messageId: 1 });
ForwardSchema.index({ user: 1, createdAt: -1 });
ForwardSchema.index({ download: 1, createdAt: -1 }); // For counting copies per download
ForwardSchema.index({ createdAt: -1 });

export default mongoose.model<IForward>("Forward", ForwardSchema);
