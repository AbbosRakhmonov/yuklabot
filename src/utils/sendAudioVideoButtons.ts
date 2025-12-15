import { Context } from "telegraf";
import { Markup } from "telegraf";
import { CANCEL_BUTTON_CALLBACK } from "@/scenes/youtube/constants";

export const sendAudioVideoButtons = async (ctx: Context): Promise<void> => {
  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback("📹 Video", "video"),
      Markup.button.callback("🎵 Audio", "audio"),
    ],
    [Markup.button.callback("❌ Bekor qilish", CANCEL_BUTTON_CALLBACK)],
  ]);

  await ctx.reply("📥 Qanday formatda yuklamoqchisiz?", keyboard);
};
