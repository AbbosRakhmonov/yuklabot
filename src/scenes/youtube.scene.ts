import { Context, Scenes } from "telegraf";

export const youtubeScene = new Scenes.WizardScene(
  "youtube-downloader",
  async (ctx: Context) => {
    await ctx.reply("Youtube downloader started");
  }
);
