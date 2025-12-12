import { Context } from "telegraf";
import { Markup } from "telegraf";

export const sendAudioVideoButtons = async (ctx: Context): Promise<void> => {
  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback("📹 Video", "video"),
      Markup.button.callback("🎵 Audio", "audio"),
    ],
  ]);

  await ctx.reply("📥 Qanday formatda yuklamoqchisiz?", keyboard);
};
