// src/config/config.ts
export const config = {
  botName: process.env.BOT_NAME || "YuklabBot",
  timezone: process.env.TZ || "Asia/Tashkent",
  telegram: {
    apiRoot: process.env.TELEGRAM_API_URL || "https://api.telegram.org",
    localMode: process.env.TELEGRAM_LOCAL_MODE === "true",
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
};
