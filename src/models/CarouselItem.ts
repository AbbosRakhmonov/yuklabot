import { Schema } from "mongoose";

/**
 * One sent message of a multi-message post (album items, slideshow music)
 */
export const CarouselItemSchema = new Schema(
  {
    messageId: { type: Number, required: true },
    itemId: { type: String, required: true },
    mediaType: { type: String, required: true },
  },
  { _id: false }
);
