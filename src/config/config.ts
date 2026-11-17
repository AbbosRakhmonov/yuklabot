// src/config/config.ts
const DEFAULT_TELEGRAM_API = "https://api.telegram.org";
const telegramApiRoot = process.env.TELEGRAM_API_URL || DEFAULT_TELEGRAM_API;
const telegramLocalMode = process.env.TELEGRAM_LOCAL_MODE === "true";

export const config = {
  botName: process.env.BOT_NAME || "YuklabBot",
  timezone: process.env.TZ || "Asia/Tashkent",
  telegram: {
    apiRoot: telegramApiRoot,
    // Talk to a self-hosted Bot API server instead of api.telegram.org
    isLocalBotApi:
      telegramLocalMode || telegramApiRoot !== DEFAULT_TELEGRAM_API,
    // Self-hosted server running with --local: only then uploads up to 2GB
    // and file:// paths work (the cloud API and a server without --local
    // stay at 50MB)
    localMode:
      telegramLocalMode && telegramApiRoot !== DEFAULT_TELEGRAM_API,
  },
  webhook: {
    enabled: process.env.WEBHOOK_ENABLED === "true",
    url: process.env.WEBHOOK_URL || "",
    path:
      process.env.WEBHOOK_PATH ||
      `/webhook/${process.env.BOT_TOKEN?.split(":")[0]}`,
    port: parseInt(process.env.PORT || process.env.WEBHOOK_PORT || "3000", 10),
    secretToken: process.env.WEBHOOK_SECRET_TOKEN || "",
  },
  ytdlp: process.env.YTDLP_PATH || "yt-dlp",
  galleryDl: process.env.GALLERY_DL_PATH || "gallery-dl",
  ffmpeg: process.env.FFMPEG_PATH || "ffmpeg",
  // ffprobe ships with ffmpeg: by default look next to FFMPEG_PATH
  ffprobe:
    process.env.FFPROBE_PATH ||
    (process.env.FFMPEG_PATH
      ? process.env.FFMPEG_PATH.replace(/ffmpeg(\.exe)?$/i, "ffprobe$1")
      : "ffprobe"),
  // A video over Telegram's limit is split into at most this many parts
  maxVideoParts: Math.max(
    1,
    parseInt(process.env.MAX_VIDEO_PARTS || "10", 10) || 10,
  ),
  instagramCookies: process.env.INSTAGRAM_COOKIES_PATH || undefined,
  logLevel: process.env.LOG_LEVEL || "info",
  downloadDir: process.env.DOWNLOAD_DIR || "downloads",
  // TikTok proxy configuration (required for regions where TikTok is blocked)
  // Format: http://proxy:port or socks5://proxy:port
  tiktokProxy: process.env.TIKTOK_PROXY || undefined,
  // Max downloads/conversions (yt-dlp, gallery-dl, ffmpeg) at the same time
  maxConcurrentProcesses: Math.max(
    1,
    parseInt(process.env.MAX_CONCURRENT_PROCESSES || "3", 10) || 3,
  ),
  // Max quick metadata lookups at the same time, separate from downloads
  maxConcurrentInfoProcesses: Math.max(
    1,
    parseInt(process.env.MAX_CONCURRENT_INFO_PROCESSES || "5", 10) || 5,
  ),
};
