import { deliveryInfo } from "@/utils/requestHistory";
import { MESSAGES } from "@/constants";
import { IMyContext } from "@/interfaces/IMyContext";
import TiktokDownload from "@/models/TiktokDownload";
import { TIKTOK_AUDIO_CALLBACK_REGEX } from "@/scenes/tiktok/constants";
import { sendTiktokAudio } from "@/scenes/tiktok/helpers/sendTiktokMedia";
import { UserError } from "@/utils/errors";

/**
 * "🎵 Audio" button under a TikTok video. Works outside of scenes, so it can
 * be pressed any time later, also on videos copied from the cache.
 */
export const handleTiktokAudioButton = async (
  ctx: IMyContext
): Promise<void> => {
  const data =
    ctx.callbackQuery && "data" in ctx.callbackQuery
      ? ctx.callbackQuery.data
      : "";
  const downloadId = TIKTOK_AUDIO_CALLBACK_REGEX.exec(data)?.[1];

  await ctx.answerCbQuery().catch(() => {});

  const download = downloadId
    ? await TiktokDownload.findById(downloadId).lean()
    : null;
  if (!download) {
    throw new UserError(MESSAGES.ERROR.LINK_EXPIRED);
  }

  deliveryInfo({ url: download.url });
  await sendTiktokAudio(ctx, download.url, ctx.callbackQuery?.message?.message_id);
};
