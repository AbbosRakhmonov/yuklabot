export const YOUTUBE_SCENE_NAME = "youtube-downloader";

export const YTDLP_SAFE_ARGS = [
  "--user-agent",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  // '--extractor-args', 'youtube:player_client=android,web',
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

// Quality menu callback data: video options are the height ("720"),
// audio options this prefix + the yt-dlp format id ("a:140")
export const AUDIO_OPTION_PREFIX = "a:";
// A quality that can't be sent: shown in the menu, pressing only explains why
export const TOO_LARGE_OPTION_CALLBACK = "too_large"; // audio over the limit
export const TOO_MANY_PARTS_CALLBACK = "too_many_parts"; // video, too many parts
