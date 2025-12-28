import { IDownload } from "@/interfaces/IDownload";

/**
 * Carousel item information stored in database
 */
export interface ICarouselItem {
  messageId: number;
  itemId: string; // Unique identifier for the carousel item
  mediaType: string; // EMediaType.VIDEO or EMediaType.IMAGE
}

/**
 * Instagram download interface
 * Extends IDownload with Instagram-specific fields
 */
export interface IInstagramDownload extends IDownload {
  carousel?: ICarouselItem[]; // Array of message IDs for carousel posts
}
