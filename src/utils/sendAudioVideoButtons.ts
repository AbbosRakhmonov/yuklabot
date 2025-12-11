import { Context, Markup } from "telegraf";

export const sendAudioVideoButtons = async (
  ctx: Context,
  url: string
): Promise<void> => {
  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback("📹 Video", url),
      Markup.button.callback("🎵 Audio", url),
    ],
  ]);

  await ctx.reply("📥 Qanday formatda yuklamoqchisiz?", keyboard);
};
