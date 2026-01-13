export const TIKTOK_SCENE_NAME = "tiktok-downloader";

export const TIKTOK_SAFE_ARGS = [
  "--impersonate",
  "chrome-101:windows-10", // Impersonate Chrome 131 on Windows to bypass TikTok anti-bot
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
export const TIKTOK_DOWNLOAD_ARGS = [...TIKTOK_SAFE_ARGS];

export const CANCEL_BUTTON_CALLBACK = "__cancel_tiktok_scene__";
