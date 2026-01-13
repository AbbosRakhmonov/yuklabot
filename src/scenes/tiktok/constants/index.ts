export const TIKTOK_SCENE_NAME = "tiktok-downloader";

// Base args without impersonate (impersonate is added dynamically from config)
export const TIKTOK_BASE_ARGS = [
  "--sleep-interval",
  "1",
  "--max-sleep-interval",
  "3",
  "--no-check-certificates",
  "--no-playlist",
];

export const CANCEL_BUTTON_CALLBACK = "__cancel_tiktok_scene__";
