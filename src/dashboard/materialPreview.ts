export function materialPreview(source: string) {
  let url: URL;
  try { url = new URL(source); } catch { return null; }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.port) return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const parts = url.pathname.split("/").filter(Boolean);
  if (["youtu.be", "youtube.com", "m.youtube.com", "music.youtube.com"].includes(host)) {
    const id = host === "youtu.be" ? parts[0] : parts[0] === "watch" ? url.searchParams.get("v")
      : ["shorts", "embed", "live"].includes(parts[0]) ? parts[1] : null;
    if (id && /^[\w-]{11}$/.test(id)) return "https://www.youtube-nocookie.com/embed/" + id;
  }
  if (host === "instagram.com" || host === "m.instagram.com") {
    const post = url.pathname.match(/^\/(?:[\w.]+\/)?(p|reels?|tv)\/([\w-]+)\/?$/);
    if (post) return "https://www.instagram.com/" + (post[1] === "reels" ? "reel" : post[1]) + "/" + post[2] + "/embed/";
  }
  if (host === "tiktok.com" || host === "m.tiktok.com") {
    const post = url.pathname.match(/^\/@[^/]+\/(?:video|photo)\/(\d+)\/?$/);
    if (post) return "https://www.tiktok.com/player/v1/" + post[1];
  }
  return null;
}
