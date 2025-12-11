export interface IYoutubeData {
  id: string;
  title: string;
  duration: number; // 98 seconds
  duration_string: string; // "1:38"
  thumbnail: string;
  channel: string;
  view_count: number;
  media_type?: string; // "video" (not always present)
  formats: Format[];
}

interface Format {
  format_id: string;
  ext: string;
  filesize?: number;
  filesize_approx?: number;
  height?: number;
  width?: number;
  resolution: string; // "1920x1080" or "audio only"
  vcodec: string; // "none" for audio-only
  acodec: string; // "none" for video-only
  abr?: number; // audio bitrate
  vbr?: number; // video bitrate
  format_note?: string; // "1080p", "medium", "low"
}
