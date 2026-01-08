export const TIKTOK_SCENE_NAME = "tiktok-downloader";

export const TIKTOK_SAFE_ARGS = [
  "--user-agent",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "--sleep-interval",
  "1",
  "--max-sleep-interval",
  "3",
  "--no-check-certificates",
  "--no-playlist",
];

// Args for getting video info (JSON output)
export const TIKTOK_GET_INFO_ARGS = [
  ...TIKTOK_SAFE_ARGS,
  "-j", // JSON output - only for info, NOT for downloading
];

// Args for downloading (no -j flag)
export const TIKTOK_DOWNLOAD_ARGS = [
  ...TIKTOK_SAFE_ARGS,
];

export const CANCEL_BUTTON_CALLBACK = "__cancel_tiktok_scene__";
