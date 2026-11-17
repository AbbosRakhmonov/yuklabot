export type InstagramLink =
  | { kind: "post"; shortcode: string; isReel: boolean }
  | { kind: "story" }
  | { kind: "share"; path: string };

const SHORTCODE = "([A-Za-z0-9_-]{5,})";

/**
 * Recognizes the Instagram link types we can handle:
 * /p/X, /reel/X, /reels/X, /tv/X (also behind /{username}/), /share/...,
 * /stories/...
 */
export const parseInstagramUrl = (url: string): InstagramLink | null => {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return null;
  }

  if (/^\/stories\//i.test(pathname) || /^\/s\//i.test(pathname)) {
    return { kind: "story" };
  }

  if (/^\/share\//i.test(pathname)) {
    return { kind: "share", path: pathname };
  }

  const match = pathname.match(
    new RegExp(`^/(?:[A-Za-z0-9._]+/)?(p|reels?|tv)/${SHORTCODE}`, "i"),
  );
  if (!match) return null;

  return {
    kind: "post",
    shortcode: match[2],
    isReel: match[1].toLowerCase().startsWith("reel"),
  };
};
