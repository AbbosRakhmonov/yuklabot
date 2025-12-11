import { Context } from "telegraf";
import { showBotAction } from "../utils/botActions";
import { Messages } from "../utils/messages";

export const helpCommand = async (ctx: Context): Promise<void> => {
  await showBotAction(ctx, "typing");
  await ctx.reply(Messages.help());
};
