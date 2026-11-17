import { EMediaType } from "@/enums/EMediaType";
import {
  IInstagramData,
  IInstagramMediaItem,
} from "@/interfaces/IInstagramData";

/**
 * Normalizes the two shapes Instagram answers with (web GraphQL / embed page
 * and the mobile API) to IInstagramData, the same shape the scenes used
 * with gallery-dl: a reel is REEL, any other post is POST with
 * `carousel_media` (one item for a single photo/video).
 * Returns null when the answer is incomplete (e.g. a video without its URL),
 * so the next method can be tried.
 */

// Web GraphQL (xdt_shortcode_media) and the embed page (shortcode_media)
export interface IGqlMedia {
  __typename?: string;
  id?: string;
  shortcode?: string;
  is_video?: boolean;
  product_type?: string;
  video_url?: string | null;
  display_url?: string;
  dimensions?: { width?: number; height?: number };
  video_duration?: number;
  taken_at_timestamp?: number;
  owner?: { username?: string };
  edge_media_to_caption?: { edges?: { node?: { text?: string } }[] };
  edge_sidecar_to_children?: { edges?: { node: IGqlMedia }[] };
}

// Mobile API (/api/v1/media/{id}/info/ items[0])
export interface IMobileMedia {
  id?: string;
  pk?: string | number;
  code?: string;
  media_type?: number; // 1 photo, 2 video, 8 carousel
  product_type?: string;
  taken_at?: number;
  original_width?: number;
  original_height?: number;
  video_duration?: number;
  caption?: { text?: string } | null;
  user?: { username?: string };
  video_versions?: { url: string; width?: number; height?: number }[];
  image_versions2?: { candidates?: { url: string; width?: number; height?: number }[] };
  carousel_media?: IMobileMedia[];
}

const byArea = <T extends { width?: number; height?: number }>(a: T, b: T) =>
  (b.width ?? 0) * (b.height ?? 0) - (a.width ?? 0) * (a.height ?? 0);

const buildData = (
  base: Omit<IInstagramData, "media_type" | "carousel_media" | "has_audio">,
  isReel: boolean,
  items: IInstagramMediaItem[],
): IInstagramData | null => {
  if (items.length === 0) return null;

  if (isReel) {
    const video = items[0];
    if (video.media_type !== EMediaType.VIDEO || !video.video_url) return null;
    return {
      ...base,
      media_type: EMediaType.REEL,
      video_url: video.video_url,
      image_url: video.image_url,
      thumbnail: video.thumbnail,
      width: video.width,
      height: video.height,
      has_audio: true,
    };
  }

  return {
    ...base,
    media_type: EMediaType.POST,
    image_url: items[0].image_url,
    thumbnail: items[0].thumbnail,
    carousel_media: items,
    has_audio: false,
  };
};

const gqlItem = (node: IGqlMedia): IInstagramMediaItem | null => {
  if (node.is_video) {
    if (!node.video_url) return null;
    return {
      id: node.id || node.shortcode || "",
      media_type: EMediaType.VIDEO,
      video_url: node.video_url,
      image_url: node.display_url,
      thumbnail: node.display_url,
      width: node.dimensions?.width,
      height: node.dimensions?.height,
      has_audio: true,
    };
  }
  if (!node.display_url) return null;
  return {
    id: node.id || node.shortcode || "",
    media_type: EMediaType.IMAGE,
    image_url: node.display_url,
    thumbnail: node.display_url,
    width: node.dimensions?.width,
    height: node.dimensions?.height,
    has_audio: false,
  };
};

export const parseGqlMedia = (
  media: IGqlMedia,
  pageUrl: string,
  linkIsReel: boolean,
): IInstagramData | null => {
  const children = media.edge_sidecar_to_children?.edges?.map((e) => e.node) ?? [];
  const nodes = children.length > 0 ? children : [media];
  const items = nodes.map(gqlItem);
  if (items.some((item) => item === null)) return null;

  const caption = media.edge_media_to_caption?.edges?.[0]?.node?.text;
  const isReel =
    children.length === 0 &&
    !!media.is_video &&
    (media.product_type === "clips" || linkIsReel);

  return buildData(
    {
      id: media.id || media.shortcode || "",
      shortcode: media.shortcode || "",
      url: pageUrl,
      title: caption?.substring(0, 100),
      caption,
      username: media.owner?.username || "",
      timestamp: media.taken_at_timestamp || Date.now() / 1000,
      width: media.dimensions?.width,
      height: media.dimensions?.height,
      duration: media.video_duration,
    },
    isReel,
    items as IInstagramMediaItem[],
  );
};

const mobileItem = (media: IMobileMedia): IInstagramMediaItem | null => {
  const image = [...(media.image_versions2?.candidates ?? [])].sort(byArea)[0];
  const id = String(media.pk ?? media.id ?? media.code ?? "");

  if (media.media_type === 2 || media.video_versions?.length) {
    const video = [...(media.video_versions ?? [])].sort(byArea)[0];
    if (!video?.url) return null;
    return {
      id,
      media_type: EMediaType.VIDEO,
      video_url: video.url,
      image_url: image?.url,
      thumbnail: image?.url,
      width: video.width ?? media.original_width,
      height: video.height ?? media.original_height,
      has_audio: true,
    };
  }

  if (!image?.url) return null;
  return {
    id,
    media_type: EMediaType.IMAGE,
    image_url: image.url,
    thumbnail: image.url,
    width: image.width ?? media.original_width,
    height: image.height ?? media.original_height,
    has_audio: false,
  };
};

export const parseMobileMedia = (
  media: IMobileMedia,
  pageUrl: string,
  linkIsReel: boolean,
): IInstagramData | null => {
  const children = media.media_type === 8 ? (media.carousel_media ?? []) : [];
  const nodes = children.length > 0 ? children : [media];
  const items = nodes.map(mobileItem);
  if (items.some((item) => item === null)) return null;

  const caption = media.caption?.text;
  const isReel =
    children.length === 0 &&
    items[0]?.media_type === EMediaType.VIDEO &&
    (media.product_type === "clips" || linkIsReel);

  return buildData(
    {
      id: String(media.pk ?? media.id ?? media.code ?? ""),
      shortcode: media.code || "",
      url: pageUrl,
      title: caption?.substring(0, 100),
      caption,
      username: media.user?.username || "",
      timestamp: media.taken_at || Date.now() / 1000,
      width: media.original_width,
      height: media.original_height,
      duration: media.video_duration,
    },
    isReel,
    items as IInstagramMediaItem[],
  );
};
