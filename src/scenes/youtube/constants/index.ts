export const YOUTUBE_SCENE_NAME = "youtube-downloader";

export const YTDLP_SAFE_ARGS = [
  "--user-agent",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  // '--extractor-args', 'youtube:player_client=android,web',
  "--sleep-interval",
  "1",
  "--max-sleep-interval",
  "3",
  "--no-check-certificates", // SSL muammolarini e'tiborsiz qoldirish
];

export const YOUTUBE_GET_INFO_ARGS = [
  ...YTDLP_SAFE_ARGS,
  "--js-runtimes",
  "node",
  // YouTube "n"/signature JS-challenge yechuvchini (EJS) GitHub'dan avtomatik
  // yuklab, to'g'ri versiyaga yangilaydi. Busiz "403 Forbidden" / "n challenge
  // solving failed" xatolari chiqadi. https://github.com/yt-dlp/yt-dlp/wiki/EJS
  "--remote-components",
  "ejs:github",
  "--no-playlist",
  // "--embed-thumbnail",
];

export const CANCEL_BUTTON_CALLBACK = "__cancel_scene__";
