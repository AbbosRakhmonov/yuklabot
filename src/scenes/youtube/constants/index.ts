export const YOUTUBE_SCENE_NAME = "youtube-downloader";

export const YTDLP_SAFE_ARGS = [
  '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  // '--extractor-args', 'youtube:player_client=android,web',
  '--sleep-interval', '1',
  '--max-sleep-interval', '3',
  '--no-check-certificates',  // SSL muammolarini e'tiborsiz qoldirish
];


export const YOUTUBE_GET_INFO_ARGS = [
  ...YTDLP_SAFE_ARGS,
  "--js-runtimes",
  "node",
  "--no-playlist",
  "--embed-thumbnail"
];
