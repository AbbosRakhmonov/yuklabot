import fs from "fs/promises";
import path from "path";
import { config } from "@/config/config";
import logger from "@/config/logger";
import { MAX_FILE_SIZE, MESSAGES } from "@/constants";
import { sanitizeUrl } from "@/helpers/sanitizeUrl";
import { IYoutubeData, IYoutubeFormat } from "@/interfaces/IYoutubeData";
import { YOUTUBE_GET_INFO_ARGS } from "@/scenes/youtube/constants";
import { UserError } from "@/utils/errors";
import {
  createDownloadFolder,
  getDownloadFolderPath,
  removeDownloadFolder,
} from "@/utils/downloadFolder";
import {
  INFO_TIMEOUT_MS,
  ProcessCancelledError,
  spawnProcessOrThrow,
} from "@/utils/processManager";
import {
  getYtdlpProgressOptions,
  ProgressCallback,
} from "@/utils/ytdlpProgress";
import { getPartCount } from "@/utils/videoSplit";
import { ProxyEntry, proxyArgs, proxyPool, withProxyRotation } from "@/utils/proxy";

// Info JSON from getInfo, reused by the download to skip a second extraction
const INFO_JSON_FILE = "info.json";

// Room for the embedded cover art and tags
const AUDIO_SIZE_MARGIN = 0.98;

export interface IVideoOption {
  height: number;
  label: string; // "720p", "1080p60"
  size?: number; // video + audio, bytes
  isApproxSize: boolean;
  parts: number; // > 1: over Telegram's limit, sent in this many parts
  tooLarge: boolean; // needs more than the allowed parts: can't be chosen
}

export interface IAudioOption {
  formatId: string; // yt-dlp format id, e.g. "140"
  label: string; // "129 kbps"
  size?: number; // bytes
  isApproxSize: boolean;
  tooLarge: boolean; // over Telegram's limit: shown, but can't be chosen
}

const isDrc = (f: IYoutubeFormat) => f.format_id.includes("drc");

/**
 * What the scene keeps in the (Mongo) session between the quality menu and
 * the download. Only what's needed: the full info is in info.json on disk.
 */
export interface IYoutubeServiceState {
  url: string;
  folderName: string | null;
  data: IYoutubeData | null;
  // Proxy the info came from (null: server IP); never the URL itself
  proxyId?: string | null;
}

export interface IDownloadOptions {
  onProgress?: ProgressCallback;
  signal?: AbortSignal;
}

interface QualityMenu {
  data: IYoutubeData;
  video: IVideoOption[];
  audio: IAudioOption[];
}

const menus = new Map<string, { menu: QualityMenu; expires: number }>();
const pendingMenus = new Map<string, Promise<QualityMenu>>();
const menuLifetimeMs = 5 * 60 * 1000;
const maxMenus = 200;

const formatSize = (f: IYoutubeFormat): number | undefined => {
  if (f.filesize != null) return f.filesize;
  if (f.filesize_approx != null) {
    // yt-dlp's filesize_approx is based only on raw stream bitrates;
    // muxing DASH video+audio into MP4 with faststart adds ~8% on disk
    return Math.round(f.filesize_approx * 1.08);
  }
  return undefined;
};

/**
 * The format yt-dlp picks for `bv[height=X]` with `-t mp4`:
 * H.264 first, then higher fps, then bigger
 */
const compareVideoFormats = (a: IYoutubeFormat, b: IYoutubeFormat) => {
  const h264 = (f: IYoutubeFormat) => (f.vcodec?.startsWith("avc1") ? 1 : 0);
  return (
    h264(b) - h264(a) ||
    (b.fps ?? 0) - (a.fps ?? 0) ||
    (formatSize(b) ?? 0) - (formatSize(a) ?? 0)
  );
};

export class YoutubeService {
  url: string;
  data: IYoutubeData | null = null;
  formatId: string | null = null;
  folderName: string | null = null;
  // The format URLs in info.json only work from the IP that got them
  // (googlevideo "ip=" parameter), so the download uses the same proxy
  proxyId: string | null = null;

  constructor(url: string) {
    this.url = sanitizeUrl(url);
  }

  static fromState(state: IYoutubeServiceState): YoutubeService {
    const service = new YoutubeService(state.url);
    service.data = state.data;
    service.folderName = state.folderName;
    service.proxyId = state.proxyId ?? null;
    return service;
  }

  async getQualityMenu(onLookup: () => Promise<unknown>): Promise<QualityMenu> {
    const cached = menus.get(this.url);
    if (cached && cached.expires > Date.now()) {
      this.data = cached.menu.data;
      return cached.menu;
    }
    menus.delete(this.url);
    const pending = pendingMenus.get(this.url);
    if (pending) {
      const menu = await pending;
      this.data = menu.data;
      return menu;
    }

    // Only the original requester owns info.json. Other downloads use their own folder.
    const lookup = (async () => {
      await onLookup();
      await this.getInfo();
      const menu = {
        data: this.toState().data!,
        video: this.getVideoOptions(),
        audio: this.getAudioOptions(),
      };
      if (menu.video.length || menu.audio.length) {
        if (menus.size >= maxMenus) menus.delete(menus.keys().next().value!);
        menus.set(this.url, { menu, expires: Date.now() + menuLifetimeMs });
      }
      return menu;
    })();
    pendingMenus.set(this.url, lookup);
    try {
      return await lookup;
    } finally {
      pendingMenus.delete(this.url);
    }
  }

  /**
   * Slim state for the session: the raw info is hundreds of KB (format URLs,
   * fragments...), written to Mongo on every update otherwise
   */
  toState(): IYoutubeServiceState {
    const data = this.data;
    return {
      url: this.url,
      folderName: this.folderName,
      proxyId: this.proxyId,
      data: data && {
        id: data.id,
        title: data.title,
        duration: data.duration,
        duration_string: data.duration_string,
        thumbnail: data.thumbnail,
        channel: data.channel,
        uploader: data.uploader,
        view_count: data.view_count,
        // Only what getVideoWidth() needs
        formats: (data.formats ?? [])
          .filter((f) => f.vcodec && f.vcodec !== "none" && f.width)
          .map((f) => ({
            format_id: f.format_id,
            ext: f.ext,
            resolution: f.resolution,
            height: f.height,
            width: f.width,
            vcodec: f.vcodec,
            acodec: f.acodec,
          })),
      },
    };
  }

  /**
   * Fetches video info and keeps the raw JSON in the download folder,
   * so the later download doesn't have to ask YouTube again
   */
  async getInfo(signal?: AbortSignal): Promise<IYoutubeData> {
    const { result, proxy } = await withProxyRotation(
      "YouTube info",
      (proxy) =>
        spawnProcessOrThrow({
          command: config.ytdlp,
          args: [this.url, ...YOUTUBE_GET_INFO_ARGS, ...proxyArgs(proxy), "-j"],
          kind: "info",
          timeout: INFO_TIMEOUT_MS,
          signal,
        }),
      { signal },
    );

    this.data = JSON.parse(result.stdout) as IYoutubeData;
    this.proxyId = proxy?.id ?? null;

    if (this.data.is_live || this.data.live_status === "is_live") {
      throw new UserError(MESSAGES.ERROR.LIVE_STREAM_UNSUPPORTED);
    }

    try {
      this.folderName = await createDownloadFolder(this.data.id || "youtube");
      await fs.writeFile(this.getInfoJsonPath() as string, result.stdout);
    } catch (error) {
      // Only an optimization: the download falls back to the URL
      logger.warning("Failed to save YouTube info JSON", { error });
    }

    return this.data;
  }

  /**
   * One option per resolution, with the expected size of the final file.
   * Over Telegram's limit the video is sent in `parts`; resolutions needing
   * more parts than allowed are marked `tooLarge`.
   */
  getVideoOptions(): IVideoOption[] {
    const formats = this.data?.formats ?? [];

    // `-t mp4` prefers AAC audio, so that's what gets merged in
    const audio = formats
      .filter((f) => f.vcodec === "none" && f.acodec && f.acodec !== "none")
      .sort(
        (a, b) =>
          Number(b.ext === "m4a") - Number(a.ext === "m4a") ||
          (b.abr ?? 0) - (a.abr ?? 0),
      )[0];
    const audioSize = audio ? formatSize(audio) : undefined;

    const byHeight = new Map<number, IYoutubeFormat>();
    for (const f of formats) {
      if (!f.vcodec || f.vcodec === "none" || !f.height || f.height < 144) {
        continue;
      }
      // `bv` only picks video-only streams; muxed ones (e.g. format 18)
      // would give a wrong size estimate
      if (f.acodec && f.acodec !== "none") continue;
      const current = byHeight.get(f.height);
      if (!current || compareVideoFormats(f, current) < 0) {
        byHeight.set(f.height, f);
      }
    }

    const options: IVideoOption[] = [];
    for (const [height, f] of byHeight) {
      const videoSize = formatSize(f);
      // Unknown size: keep the option, the final check happens after download
      const size =
        videoSize != null ? videoSize + (audioSize ?? 0) : undefined;
      const parts = size !== undefined ? getPartCount(size) : 1;

      options.push({
        height,
        label: f.fps && f.fps > 30 ? `${height}p${Math.round(f.fps)}` : `${height}p`,
        size,
        // yt-dlp JSON has null (not a missing key) for unknown values
        isApproxSize: f.filesize == null || (audio != null && audio.filesize == null),
        parts,
        tooLarge: parts > config.maxVideoParts,
      });
    }

    return options.sort((a, b) => a.height - b.height);
  }

  /**
   * Width of the video format with the given height (for Telegram's player)
   */
  getVideoWidth(height: number): number | undefined {
    return this.data?.formats?.find(
      (f) => f.height === height && f.vcodec !== "none" && f.width,
    )?.width;
  }

  async downloadVideo(
    height: string,
    options: IDownloadOptions = {},
  ): Promise<string> {
    // height comes from callback data, which a client can forge
    if (!/^\d{2,4}$/.test(height)) {
      throw new Error(`Invalid video height: ${height}`);
    }
    this.formatId = height;

    return this.download(
      ["-f", `bv[height=${height}]+ba`, "-t", "mp4"],
      options,
    );
  }

  /**
   * The original audio tracks Telegram plays as music (m4a/AAC), one per
   * bitrate, with their size. Never re-encoded, so the user picks the
   * quality; tracks that won't fit into Telegram's limit are marked `tooLarge`.
   */
  getAudioOptions(): IAudioOption[] {
    const m4a = (this.data?.formats ?? []).filter(
      (f) =>
        f.ext === "m4a" &&
        f.vcodec === "none" &&
        f.acodec &&
        f.acodec !== "none",
    );
    // "-drc" (dynamic range compressed) duplicates only when nothing else
    const plain = m4a.filter((f) => !isDrc(f));
    const candidates = plain.length > 0 ? plain : m4a;

    const byBitrate = new Map<number, IYoutubeFormat>();
    for (const f of candidates) {
      const kbps = Math.round(f.abr ?? 0);
      if (!byBitrate.has(kbps)) byBitrate.set(kbps, f);
    }

    const options: IAudioOption[] = [];
    for (const [kbps, f] of byBitrate) {
      const size = formatSize(f) ?? undefined;
      options.push({
        formatId: f.format_id,
        label: kbps > 0 ? `${kbps} kbps` : "m4a",
        size,
        isApproxSize: f.filesize == null,
        tooLarge:
          size !== undefined && size > MAX_FILE_SIZE * AUDIO_SIZE_MARGIN,
      });
    }

    return options.sort(
      (a, b) => parseInt(a.label, 10) - parseInt(b.label, 10),
    );
  }

  /**
   * Downloads the chosen original audio track as is (no re-encoding)
   */
  async downloadAudio(
    formatId: string,
    options: IDownloadOptions = {},
  ): Promise<string> {
    // formatId comes from callback data, which a client can forge
    if (!/^[\w-]{1,32}$/.test(formatId)) {
      throw new Error(`Invalid audio format id: ${formatId}`);
    }
    this.formatId = formatId;

    return this.download(
      [
        "--embed-metadata",
        "--embed-thumbnail",
        // The cover would otherwise become a ~1.5 MB PNG inside the m4a
        "--convert-thumbnails",
        "jpg",
        "-f",
        formatId,
        // m4a source: only the container is rewritten, the audio is copied
        "-x",
        "--audio-format",
        "m4a",
      ],
      options,
    );
  }

  private async download(
    formatArgs: string[],
    { onProgress, signal }: IDownloadOptions,
  ): Promise<string> {
    if (!this.folderName) {
      this.folderName = await createDownloadFolder(this.data?.id || "youtube");
    }
    const progress = getYtdlpProgressOptions(onProgress);

    const run = (source: string[], proxy: ProxyEntry | null) =>
      spawnProcessOrThrow({
        command: config.ytdlp,
        args: [
          ...source,
          ...YOUTUBE_GET_INFO_ARGS,
          ...proxyArgs(proxy),
          ...formatArgs,
          ...progress.args,
          // Download DASH fragments in parallel
          "-N",
          "4",
          "-P",
          getDownloadFolderPath(this.folderName as string),
          "-o",
          `%(title).150B.%(ext)s`,
        ],
        ignoreStdout: true,
        onStdoutLine: progress.onStdoutLine,
        signal,
      });

    try {
      const infoJsonPath = await this.getExistingInfoJsonPath();
      // The saved URLs need the IP that got them; if that proxy is gone
      // (list changed, restart), they are useless
      const infoProxy = this.proxyId ? proxyPool.getById(this.proxyId) : null;
      let downloaded = false;
      // undefined: nothing to exclude from the rotation below
      let failedProxy: ProxyEntry | null | undefined;

      if (infoJsonPath && infoProxy !== undefined) {
        try {
          await run(["--load-info-json", infoJsonPath], infoProxy);
          downloaded = true;
        } catch (error) {
          if (error instanceof ProcessCancelledError) throw error;
          failedProxy = infoProxy;
          // Saved format URLs may have expired or the proxy died
          logger.warning("Download from saved info failed, retrying by URL", {
            url: this.url,
            error: error instanceof Error ? error.message.slice(-500) : String(error),
          });
        }
      }

      if (!downloaded) {
        await withProxyRotation("YouTube download", (proxy) => run([this.url], proxy), {
          signal,
          exclude: failedProxy,
        });
      }
    } catch (error) {
      await this.cleanupFolder();
      throw error;
    }

    return this.folderName;
  }

  private getInfoJsonPath(): string | null {
    return this.folderName
      ? path.join(getDownloadFolderPath(this.folderName), INFO_JSON_FILE)
      : null;
  }

  private async getExistingInfoJsonPath(): Promise<string | null> {
    const infoJsonPath = this.getInfoJsonPath();
    if (!infoJsonPath) return null;
    try {
      await fs.access(infoJsonPath);
      return infoJsonPath;
    } catch {
      return null;
    }
  }

  /**
   * Safely removes the download folder if it exists, never throws
   */
  async cleanupFolder(): Promise<void> {
    await removeDownloadFolder(this.folderName);
  }
}
