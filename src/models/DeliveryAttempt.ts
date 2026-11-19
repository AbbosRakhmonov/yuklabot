import mongoose, { Schema } from "mongoose";

const schema = new Schema({
  _id: Number, // One final result per Telegram update, including retried updates
  finishedAt: { type: Date, required: true, expires: 7 * 86400 },
  platform: { type: String, required: true },
  outcome: { type: String, required: true },
  reason: String,
  requestId: Number,
  userId: Number,
  stage: String,
});

export default mongoose.model("DeliveryAttempt", schema);
