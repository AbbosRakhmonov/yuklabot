import { EMediaType } from "@/enums/EMediaType";

export interface IInstagramData {
  id: string;
  shortcode: string;
  url: string;
  title?: string;
  caption?: string;
  username: string;
  timestamp: number;
  media_type: EMediaType;
  thumbnail?: string;
  video_url?: string;
  image_url?: string;
  carousel_media?: IInstagramMediaItem[];
  width?: number;
  height?: number;
  duration?: number;
  has_audio?: boolean;
}

export interface IInstagramMediaItem {
  id: string;
  media_type: EMediaType;
  image_url?: string;
  video_url?: string;
  thumbnail?: string;
  width?: number;
  height?: number;
  has_audio?: boolean;
}
