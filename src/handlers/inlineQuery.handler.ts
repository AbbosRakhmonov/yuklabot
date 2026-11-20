import type { InlineQueryResult } from "telegraf/types";
import Download from "@/models/Download";
import "@/models/YoutubeDownload";
import "@/models/InstagramDownload";
import "@/models/TiktokDownload";
import "@/models/FacebookDownload";
import { EMediaType } from "@/enums/EMediaType";
import { IMyContext } from "@/interfaces/IMyContext";
import { extractSupportedUrl, urlVariants } from "@/helpers/extractSupportedUrl";
import logger from "@/config/logger";

interface CachedRecord {
  _id: unknown;
  fileId?: string;
  mediaType: EMediaType;
  platform: string;
  fileName?: string;
  height?: number;
}

const OPEN_BOT = (text: string) => ({ text, start_parameter: "inline" });

function title(record: CachedRecord): string {
  if (record.mediaType === EMediaType.AUDIO) return "🎵 Audio";
  if (record.height) return `🎥 Video ${record.height}p`;
  if (record.mediaType === EMediaType.IMAGE) return "🖼 Rasm";
  return "🎥 Video";
}

function toResult(record: CachedRecord, caption: string): InlineQueryResult | undefined {
  const id = String(record._id);
  const fileId = record.fileId as string;
  switch (record.mediaType) {
    case EMediaType.VIDEO:
    case EMediaType.REEL:
    case EMediaType.STORY:
      return { type: "video", id, video_file_id: fileId, title: title(record), caption };
    case EMediaType.AUDIO:
      return { type: "audio", id, audio_file_id: fileId, caption };
    case EMediaType.IMAGE:
      return { type: "photo", id, photo_file_id: fileId, title: title(record), caption };
    default:
      return { type: "document", id, document_file_id: fileId, title: record.fileName || title(record), caption };
  }
}

/**
 * "@bot <link>" in any chat: answers only from the cache (Telegram file_id),
 * because an inline answer can't wait for a download. A link nobody has
 * downloaded yet gets a button that opens the bot.
 */
export const handleInlineQuery = async (ctx: IMyContext): Promise<void> => {
  const query = ctx.inlineQuery?.query ?? "";
  const url = await extractSupportedUrl(query);
  if (!url) {
    await ctx.answerInlineQuery([], {
      cache_time: 300,
      button: OPEN_BOT("YouTube, Instagram, TikTok yoki Facebook havolasini yozing"),
    });
    return;
  }

  let results: InlineQueryResult[] = [];
  try {
    const records = await Download.find({
      url: { $in: urlVariants(url) },
      fileId: { $exists: true, $ne: null },
      cacheIncomplete: { $ne: true },
      // A video sent in parts can't be one inline result
      "carousel.0": { $exists: false },
    }).sort({ createdAt: -1 }).limit(20).lean<CachedRecord[]>();

    const caption = `📥 @${ctx.botInfo.username}`;
    const seen = new Set<string>();
    for (const record of records) {
      const key = `${record.mediaType}:${record.height ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const result = toResult(record, caption);
      if (result) results.push(result);
    }
  } catch (error) {
    logger.error("Inline cache lookup failed", { error });
    results = [];
  }

  await ctx.answerInlineQuery(results, {
    cache_time: results.length ? 300 : 30,
    is_personal: false,
    ...(!results.length && { button: OPEN_BOT("Hali yuklanmagan — botda yuklab olish") }),
  });
};
