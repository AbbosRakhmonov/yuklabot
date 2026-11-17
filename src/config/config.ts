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
  // Posts and reels are fetched without cookies; the cookies file is only
  // used for stories (Instagram has no anonymous way to see them)
  instagramCookies: process.env.INSTAGRAM_COOKIES_PATH || undefined,
  // Without cookies (or if they fail) stories come from this third-party
  // API (GET {base}/insta?url=...); "false" turns it off. Only story links
  // are sent to it.
  instagramStoryApi: ["false", "off", "0"].includes(
    (process.env.INSTAGRAM_STORY_API || "").toLowerCase(),
  )
    ? null
    : (process.env.INSTAGRAM_STORY_API || "https://jerrycoder.oggyapi.workers.dev").replace(
        /\/+$/,
        "",
      ),
  // doc_ids of Instagram's anonymous post GraphQL queries, tried in order;
  // Instagram retires them now and then, so they can be updated without a
  // deploy (comma separated)
  instagramGqlDocIds: (
    process.env.INSTAGRAM_GQL_DOC_ID ||
    "25018359077785073,24368985919464652,8845758582119845"
  )
    .split(",")
    .map((id) => id.trim())
    .filter((id) => /^\d+$/.test(id)),
  // Outgoing requests to Instagram/TikTok/YouTube go through these proxies
  // in turn (a different one each time), then the server's own IP
  proxy: {
    // http://user:pass@host:port, https://..., socks5://user:pass@host:port
    // separated by commas or new lines
    list: process.env.PROXY_LIST || "",
    // A file with one proxy per line (# comments allowed)
    file: process.env.PROXY_FILE || undefined,
    // At most this many proxies are tried per request (then the server IP)
    maxAttempts: Math.max(
      1,
      parseInt(process.env.PROXY_MAX_ATTEMPTS || "3", 10) || 3,
    ),
    // A blocked/dead proxy is skipped for this long
    cooldownMs:
      Math.max(0, parseFloat(process.env.PROXY_COOLDOWN_MINUTES || "10") || 0) *
      60 *
      1000,
    // Fall back to the server's own IP when every proxy failed
    directFallback: process.env.PROXY_DIRECT_FALLBACK !== "false",
  },
  logLevel: process.env.LOG_LEVEL || "info",
  downloadDir: process.env.DOWNLOAD_DIR || "downloads",
  // Deprecated: an extra proxy added to the PROXY_LIST pool
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
