import { CANCEL_BUTTON_TEXT, MESSAGES } from "@/constants";
import { EMediaType } from "@/enums/EMediaType";
import { IMyContext } from "@/interfaces/IMyContext";
import { YoutubeService } from "@/services";
import { Markup } from "telegraf";
import { callbackQuery } from "telegraf/filters";
import {
  AUDIO_OPTION_PREFIX,
  CANCEL_BUTTON_CALLBACK,
  TOO_LARGE_OPTION_CALLBACK,
  TOO_MANY_PARTS_CALLBACK,
} from "@/scenes/youtube/constants";
import { handleCancelButton } from "@/scenes/helpers";
import { formatFileSize } from "@/helpers/formatFileSize";

interface IMenuOption {
  text: string;
  data: string;
  selectable: boolean;
}

interface IQualityOption {
  label: string;
  size?: number;
  isApproxSize: boolean;
  parts?: number; // video only
  tooLarge: boolean;
}

/**
 * Too large qualities stay visible (marked 🚫), so the user sees that a
 * better quality exists and why it can't be chosen.
 * A video over the limit shows how many parts it will come in.
 */
const toMenuOption = (
  icon: string,
  option: IQualityOption,
  data: string,
  tooLargeData: string
): IMenuOption => {
  const size =
    option.size === undefined
      ? ""
      : ` · ${option.isApproxSize ? "~" : ""}${formatFileSize(option.size)}`;
  const parts = option.parts && option.parts > 1 ? ` (${option.parts} qism)` : "";
  return option.tooLarge
    ? { text: `🚫 ${option.label}${size}`, data: tooLargeData, selectable: false }
    : { text: `${icon} ${option.label}${size}${parts}`, data, selectable: true };
};

/**
 * Shows the quality menu for video or audio; nothing is ever re-encoded,
 * the user picks among the original qualities that fit into Telegram's limit
 */
export const youtubeStep2 = async (ctx: IMyContext) => {
  if (!ctx.has(callbackQuery("data"))) return ctx.scene.leave();

  await ctx.answerCbQuery();
  const type = ctx.callbackQuery.data;

  if (await handleCancelButton(ctx, type)) return;
  if (type !== EMediaType.VIDEO && type !== EMediaType.AUDIO) {
    return ctx.scene.leave();
  }

  const service = new YoutubeService(ctx.wizard.state.youtube.url);

  await ctx.editMessageText(MESSAGES.INFO.ANALYZING);
  await service.getInfo();
  ctx.wizard.state.youtube.service = service.toState();
  await ctx.deleteMessage();

  const isVideo = type === EMediaType.VIDEO;
  const options: IMenuOption[] = isVideo
    ? service
        .getVideoOptions()
        .map((o) =>
          toMenuOption("🎥", o, String(o.height), TOO_MANY_PARTS_CALLBACK)
        )
    : service
        .getAudioOptions()
        .map((o) =>
          toMenuOption(
            "🎵",
            o,
            `${AUDIO_OPTION_PREFIX}${o.formatId}`,
            TOO_LARGE_OPTION_CALLBACK
          )
        );

  if (!options.some((o) => o.selectable)) {
    await service.cleanupFolder();
    await ctx.reply(
      isVideo ? MESSAGES.ERROR.NO_FITTING_QUALITY : MESSAGES.ERROR.NO_FITTING_AUDIO
    );
    return ctx.scene.leave();
  }

  const keyboard = Markup.inlineKeyboard([
    ...options.map((o) => [Markup.button.callback(o.text, o.data)]),
    [Markup.button.callback(CANCEL_BUTTON_TEXT, CANCEL_BUTTON_CALLBACK)],
  ]);

  const hint = isVideo ? MESSAGES.INFO.VIDEO_QUALITY : MESSAGES.INFO.AUDIO_QUALITY;
  const caption = `📺 ${service.data?.title} - ${service.data?.duration_string}\n\n${hint}`;
  if (service.data?.thumbnail) {
    try {
      await ctx.replyWithPhoto(service.data.thumbnail, { caption, ...keyboard });
    } catch {
      await ctx.reply(caption, keyboard);
    }
  } else {
    await ctx.reply(caption, keyboard);
  }

  return ctx.wizard.next();
};
