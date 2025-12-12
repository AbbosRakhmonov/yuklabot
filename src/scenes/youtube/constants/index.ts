import { MAX_FILE_SIZE } from "@/constants";

export const YOUTUBE_SCENE_NAME = "youtube-downloader";
export const YOUTUBE_GET_INFO_ARGS = [
  "--js-runtimes",
  "node",
  "-i",
  "-J",
  "--no-playlist",
  "--match-filters",
  "!age_limit",
  `filesize<${MAX_FILE_SIZE}`,
  "/",
  `filesize_approx<${MAX_FILE_SIZE}`,
  "--skip-download",
];
