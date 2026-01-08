export interface ITiktokData {
  id: string;
  title: string;
  description?: string;
  duration: number; // seconds
  duration_string?: string; // "0:15"
  thumbnail: string;
  uploader: string;
  uploader_id?: string;
  view_count?: number;
  like_count?: number;
  comment_count?: number;
  filesize?: number;
  filesize_approx?: number;
  ext?: string;
  width?: number;
  height?: number;
}
