import crypto from "crypto";
import { config } from "@/config/config";
import logger from "@/config/logger";
import { IInstagramData } from "@/interfaces/IInstagramData";
import {
  BlockedError,
  fetchText,
  httpRequest,
  maskProxy,
  PermanentError,
  ProxyEntry,
} from "@/utils/proxy";
import {
  BROWSER_HEADERS,
  GQL_FRIENDLY_NAME,
  IG_APP_ID,
  IG_ASBD_ID,
  MOBILE_HEADERS,
} from "./constants";
import { IGqlMedia, IMobileMedia, parseGqlMedia, parseMobileMedia } from "./instagramParser";
import { parseInstagramUrl } from "./instagramUrl";

/**
 * Cookie-less Instagram post fetching, the way cobalt does it: Instagram lets
 * logged-out clients see public posts through a few endpoints, tried in turn
 * (each one may be closed for some IPs/posts at any time):
 *   1. mobile app API (oEmbed -> media id -> media info)
 *   2. the embed page (/p/X/embed/captioned/)
 *   3. the web GraphQL query a logged-out instagram.com runs
 * All requests of one attempt go through the same proxy.
 */

/**
 * The post doesn't exist or isn't public: no other IP will help
 */
export class InstagramUnavailableError extends PermanentError {
  constructor(shortcode: string) {
    super(`Instagram post ${shortcode} is unavailable`);
    this.name = "InstagramUnavailableError";
  }
}

interface IFetchContext {
  shortcode: string;
  pageUrl: string;
  isReel: boolean;
  proxy: ProxyEntry | null;
  signal?: AbortSignal;
}

const postUrl = (shortcode: string) => `https://www.instagram.com/p/${shortcode}/`;

const randomToken = (bytes: number) => crypto.randomBytes(bytes).toString("base64url");

const match = (text: string, re: RegExp): string | undefined => text.match(re)?.[1];

/**
 * Instagram answers a blocked/rate-limited IP with 429, or 401/403 and a
 * "login required" page or redirect
 */
const assertNotBlocked = (status: number, text: string, finalUrl: string) => {
  const { pathname } = new URL(finalUrl);
  if (
    status === 401 ||
    status === 403 ||
    status === 429 ||
    // Redirected to the login page / a challenge
    /^\/(accounts\/login|challenge)/.test(pathname) ||
    /"require_login":true|"message":"(login_required|checkpoint_required)"|"spam":true|Please wait a few minutes/.test(text)
  ) {
    throw new BlockedError(`Instagram blocked the request (${status}) ${pathname}`);
  }
};

// 1. Mobile API

const getMediaId = async (ctx: IFetchContext): Promise<string | "not_found" | undefined> => {
  const url = `https://i.instagram.com/api/v1/oembed/?url=${encodeURIComponent(postUrl(ctx.shortcode))}`;
  const { status, text } = await fetchText(url, {
    headers: MOBILE_HEADERS,
    proxy: ctx.proxy,
    signal: ctx.signal,
  });
  if (status === 404) return "not_found";
  if (status !== 200) return undefined;
  try {
    return (JSON.parse(text) as { media_id?: string }).media_id;
  } catch {
    return undefined;
  }
};

const requestMobileApi = async (
  ctx: IFetchContext,
  mediaId: string,
): Promise<IInstagramData | null> => {
  const url = `https://i.instagram.com/api/v1/media/${mediaId}/info/`;
  const { status, text } = await fetchText(url, {
    headers: MOBILE_HEADERS,
    proxy: ctx.proxy,
    signal: ctx.signal,
  });
  // Logged-out access to this endpoint is often closed: not an IP block
  if (status !== 200) return null;
  const item = (JSON.parse(text) as { items?: IMobileMedia[] }).items?.[0];
  return item ? parseMobileMedia(item, ctx.pageUrl, ctx.isReel) : null;
};

// 2. Embed page

interface IEmbedContext {
  gql_data?: { shortcode_media?: IGqlMedia; xdt_shortcode_media?: IGqlMedia } | null;
  media?: IMobileMedia;
}

const requestEmbed = async (
  ctx: IFetchContext,
): Promise<IInstagramData | null | "empty"> => {
  const url = `https://www.instagram.com/p/${ctx.shortcode}/embed/captioned/`;
  const { status, text, url: finalUrl } = await fetchText(url, {
    headers: BROWSER_HEADERS,
    proxy: ctx.proxy,
    signal: ctx.signal,
  });
  assertNotBlocked(status, text, finalUrl);
  if (status !== 200) return null;

  const init = match(text, /"init",\[\],\[(.*?)\]\],/);
  if (!init) return null;
  const contextJSON = (JSON.parse(init) as { contextJSON?: string | null }).contextJSON;
  const context = contextJSON ? (JSON.parse(contextJSON) as IEmbedContext | null) : null;
  // The page loaded fine but has nothing: the post isn't (publicly) there
  if (!context) return "empty";

  const media = context.gql_data?.shortcode_media || context.gql_data?.xdt_shortcode_media;
  if (media) return parseGqlMedia(media, ctx.pageUrl, ctx.isReel);
  if (context.media) return parseMobileMedia(context.media, ctx.pageUrl, ctx.isReel);
  return null;
};

// 3. Web GraphQL

interface IGqlParams {
  headers: Record<string, string>;
  body: Record<string, string>;
}

/**
 * Tokens a logged-out instagram.com page carries, needed by its GraphQL API
 */
const getGqlParams = async (ctx: IFetchContext): Promise<IGqlParams> => {
  const url = postUrl(ctx.shortcode);
  const {
    status,
    text: html,
    url: finalUrl,
    headers: responseHeaders,
  } = await fetchText(url, {
    headers: BROWSER_HEADERS,
    proxy: ctx.proxy,
    signal: ctx.signal,
  });
  assertNotBlocked(status, html, finalUrl);

  // The anonymous session cookies the page just set (csrftoken, ig_did,
  // mid, datr): the CSRF header has to match the csrftoken cookie
  const setCookies: Record<string, string> = {};
  for (const line of responseHeaders["set-cookie"] ?? []) {
    const [pair] = line.split(";");
    const index = pair.indexOf("=");
    if (index > 0) setCookies[pair.slice(0, index).trim()] = pair.slice(index + 1).trim();
  }

  const lsd = match(html, /"LSD",\[\],\{"token":"([^"]+)"/) || randomToken(8);
  const csrf = setCookies.csrftoken || match(html, /"csrf_token":"([^"]+)"/);
  const deviceId = setCookies.ig_did || match(html, /"device_id":"([^"]+)"/);
  const machineId = setCookies.mid || match(html, /"machine_id":"([^"]+)"/);
  const appId = match(html, /"DGWWebConfig",\[\],\{[^}]*?"appId":"(\d+)"/) || IG_APP_ID;
  const bloksVersion = match(html, /"versioningID":"([^"]+)"/);

  const cookie = [
    csrf && `csrftoken=${csrf}`,
    deviceId && `ig_did=${deviceId}`,
    machineId && `mid=${machineId}`,
    setCookies.datr && `datr=${setCookies.datr}`,
    "wd=1280x720",
    "dpr=2",
    "ig_nrcb=1",
  ]
    .filter(Boolean)
    .join("; ");

  const headers: Record<string, string> = {
    "x-ig-app-id": appId,
    "x-fb-lsd": lsd,
    "x-asbd-id": IG_ASBD_ID,
    cookie,
  };
  if (csrf) headers["x-csrftoken"] = csrf;
  if (bloksVersion) headers["x-bloks-version-id"] = bloksVersion;

  const body: Record<string, string> = {
    __d: "www",
    __a: "1",
    __s: `::${Math.random().toString(36).substring(2).replace(/\d/g, "").slice(0, 6)}`,
    __hs: match(html, /"haste_session":"([^"]+)"/) || "20126.HYP:instagram_web_pkg.2.1...0",
    __req: "b",
    __ccg: "EXCELLENT",
    __rev: match(html, /"__spin_r":(\d+)/) || match(html, /"rollout_hash":"(\d+)"/) || "1019933358",
    __hsi: match(html, /"hsi":"(\d+)"/) || "7436540909012459023",
    __dyn: randomToken(154),
    __csr: randomToken(154),
    __user: "0",
    __comet_req: match(html, /__comet_req=(\d+)/) || "7",
    av: "0",
    dpr: "2",
    lsd,
    jazoest: match(html, /jazoest=(\d+)/) || String(Math.floor(Math.random() * 10000)),
    __spin_r: match(html, /"__spin_r":(\d+)/) || "1019933358",
    __spin_b: match(html, /"__spin_b":"([^"]+)"/) || "trunk",
    __spin_t: match(html, /"__spin_t":(\d+)/) || String(Math.floor(Date.now() / 1000)),
  };

  return { headers, body };
};

const requestGql = async (ctx: IFetchContext): Promise<IInstagramData | null> => {
  const { headers, body } = await getGqlParams(ctx);
  // (/graphql/query answers logged-out clients with "Please wait a few
  // minutes" now; /api/graphql still serves them)
  const url = "https://www.instagram.com/api/graphql";
  let rateLimited = 0;

  // Instagram retires query ids: try each configured one
  for (const docId of config.instagramGqlDocIds) {
    const { status, text, url: finalUrl } = await fetchText(url, {
      method: "POST",
      headers: {
        ...BROWSER_HEADERS,
        ...headers,
        "content-type": "application/x-www-form-urlencoded",
        "x-fb-friendly-name": GQL_FRIENDLY_NAME,
        "sec-fetch-site": "same-origin",
        "sec-fetch-mode": "cors",
        "sec-fetch-dest": "empty",
        origin: "https://www.instagram.com",
        referer: postUrl(ctx.shortcode),
      },
      body: new URLSearchParams({
        ...body,
        fb_api_caller_class: "RelayModern",
        fb_api_req_friendly_name: GQL_FRIENDLY_NAME,
        variables: JSON.stringify({
          shortcode: ctx.shortcode,
          fetch_tagged_user_count: null,
          hoisted_comment_id: null,
          hoisted_reply_id: null,
        }),
        server_timestamps: "true",
        doc_id: docId,
      }).toString(),
      proxy: ctx.proxy,
      signal: ctx.signal,
    });
    assertNotBlocked(status, text, finalUrl);
    if (status !== 200) continue;

    const response = JSON.parse(text) as {
      errors?: { message?: string }[];
      data?: {
        // Older queries: the web shape
        xdt_shortcode_media?: IGqlMedia | null;
        shortcode_media?: IGqlMedia | null;
        // Newer queries: the mobile API shape
        xdt_api__v1__media__shortcode__web_info?: { items?: IMobileMedia[] } | null;
      };
    };

    // A retired id answers "Rate limit exceeded" too, so only all of them
    // saying it means this IP is limited
    if (response.errors?.some((e) => /rate limit/i.test(e.message ?? ""))) {
      rateLimited++;
      continue;
    }

    const data = response.data;
    const media = data?.xdt_shortcode_media || data?.shortcode_media;
    if (media) return parseGqlMedia(media, ctx.pageUrl, ctx.isReel);
    const item = data?.xdt_api__v1__media__shortcode__web_info?.items?.[0];
    if (item) return parseMobileMedia(item, ctx.pageUrl, ctx.isReel);
  }

  if (rateLimited > 0 && rateLimited === config.instagramGqlDocIds.length) {
    throw new BlockedError("Instagram GraphQL: rate limit exceeded");
  }
  return null;
};

/**
 * Runs one method; any failure except a block just means "try the next one"
 */
const attempt = async <T>(
  ctx: IFetchContext,
  name: string,
  method: () => Promise<T>,
): Promise<T | null> => {
  try {
    return await method();
  } catch (error) {
    if (error instanceof BlockedError || ctx.signal?.aborted) throw error;
    // The proxy itself is dead: no other method will get through it either
    if (error instanceof Error && error.message.startsWith("ProxyError")) {
      throw new BlockedError(error.message);
    }
    logger.debug(`Instagram ${name} failed`, {
      shortcode: ctx.shortcode,
      proxy: maskProxy(ctx.proxy),
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
};

/**
 * Fetches a public post through one proxy (null: the server's IP).
 * Throws BlockedError when this IP got nothing (the caller tries another),
 * InstagramUnavailableError when the post is gone or not public.
 */
export const fetchInstagramPost = async (
  shortcode: string,
  pageUrl: string,
  isReel: boolean,
  proxy: ProxyEntry | null,
  signal?: AbortSignal,
): Promise<IInstagramData> => {
  const ctx: IFetchContext = { shortcode, pageUrl, isReel, proxy, signal };

  const mediaId = await attempt(ctx, "oembed", () => getMediaId(ctx));
  if (mediaId && mediaId !== "not_found") {
    const data = await attempt(ctx, "mobile api", () => requestMobileApi(ctx, mediaId));
    if (data) return data;
  }

  const embed = await attempt(ctx, "embed", () => requestEmbed(ctx));
  if (embed && embed !== "empty") return embed;

  // oEmbed: "No Media Match" and an empty embed page: the post isn't public
  if (mediaId === "not_found" && embed === "empty") {
    throw new InstagramUnavailableError(shortcode);
  }

  const gql = await attempt(ctx, "graphql", () => requestGql(ctx));
  if (gql) return gql;

  throw new BlockedError(`Instagram returned no data for ${shortcode}`);
};

export type InstagramErrorContext = "private" | "age_restricted" | "unknown";

/**
 * Asks Instagram why a post can't be seen logged out (private account or
 * age restriction), for a clear message to the user
 */
export const getInstagramErrorContext = async (
  shortcode: string,
  proxy: ProxyEntry | null,
): Promise<InstagramErrorContext> => {
  const ctx: IFetchContext = { shortcode, pageUrl: postUrl(shortcode), isReel: false, proxy };
  try {
    const { headers, body } = await getGqlParams(ctx);
    const { text } = await fetchText("https://www.instagram.com/ajax/bulk-route-definitions/", {
      method: "POST",
      headers: {
        ...BROWSER_HEADERS,
        ...headers,
        "content-type": "application/x-www-form-urlencoded",
        "x-ig-d": "www",
      },
      body: new URLSearchParams({
        "route_urls[0]": `/p/${shortcode}/`,
        routing_namespace: "igx_www",
        ...body,
      }).toString(),
      proxy,
    });

    if (text.includes('"tracePolicy":"polaris.privatePostPage"')) return "private";

    const ids = text.match(/"media_id":\s*?"(\d+)","media_owner_id":\s*?"(\d+)"/);
    if (ids) {
      const url = new URL("https://www.instagram.com/api/v1/web/get_ruling_for_media_content_logged_out");
      url.searchParams.set("media_id", ids[1]);
      url.searchParams.set("owner_id", ids[2]);
      const response = await httpRequest(url.toString(), {
        headers: { ...BROWSER_HEADERS, ...headers, "x-ig-app-id": IG_APP_ID, "sec-fetch-site": "same-origin" },
        proxy,
      });
      const ruling = (await response.json<{ title?: string }>().catch(() => null)) ?? {};
      if (ruling.title?.includes("Restricted")) return "age_restricted";
    }
  } catch (error) {
    logger.debug("Instagram error context failed", {
      shortcode,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return "unknown";
};

/**
 * instagram.com/share/... links redirect to the post; Instagram only sends
 * the redirect (not an HTML page) to non-browser user agents
 */
export const resolveInstagramShareLink = async (
  path: string,
  proxy: ProxyEntry | null,
  signal?: AbortSignal,
): Promise<string | null> => {
  const response = await httpRequest(`https://www.instagram.com${path}`, {
    headers: { "user-agent": "curl/7.88.1", accept: "*/*" },
    proxy,
    signal,
    maxRedirects: 0,
  });
  response.body.resume();

  const location = response.headers.location;
  if (response.status === 429) throw new BlockedError("Instagram share link: HTTP 429");
  if (!location) return null;

  const target = new URL(location, "https://www.instagram.com").toString();
  return parseInstagramUrl(target)?.kind === "post" ? target : null;
};
