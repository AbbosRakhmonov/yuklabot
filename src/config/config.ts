// src/config/config.ts
const DEFAULT_TELEGRAM_API = "https://api.telegram.org";
const telegramApiRoot = process.env.TELEGRAM_API_URL || DEFAULT_TELEGRAM_API;
const telegramLocalMode = process.env.TELEGRAM_LOCAL_MODE === "true";

export const config = {
  botName: process.env.BOT_NAME || "YuklabBot",
  timezone: process.env.TZ || "Asia/Tashkent",
  telegram: {
    apiRoot: telegramApiRoot,
    localMode: telegramLocalMode,
    // Local Bot API server allows 2GB uploads, the cloud API only 50MB
    isLocalBotApi:
      telegramLocalMode || telegramApiRoot !== DEFAULT_TELEGRAM_API,
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
  instagramCookies: process.env.INSTAGRAM_COOKIES_PATH || undefined,
  logLevel: process.env.LOG_LEVEL || "info",
  downloadDir: process.env.DOWNLOAD_DIR || "downloads",
  // TikTok proxy configuration (required for regions where TikTok is blocked)
  // Format: http://proxy:port or socks5://proxy:port
  tiktokProxy: process.env.TIKTOK_PROXY || undefined,
  // Max yt-dlp/gallery-dl/ffmpeg processes running at the same time
  maxConcurrentProcesses: Math.max(
    1,
    parseInt(process.env.MAX_CONCURRENT_PROCESSES || "3", 10) || 3,
  ),
};
