export const TIKTOK_SCENE_NAME = "tiktok-downloader";

// Base args without impersonate (impersonate is added dynamically from config)
export const TIKTOK_BASE_ARGS = ["--no-playlist"];

// "🎵 Audio" button under a sent TikTok video, carries the Download record id
export const TIKTOK_AUDIO_CALLBACK_PREFIX = "tt_audio:";
export const TIKTOK_AUDIO_CALLBACK_REGEX = /^tt_audio:([a-f0-9]{24})$/;
