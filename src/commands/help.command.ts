import { showBotAction } from "../utils/botActions";
import { Messages } from "../utils/messages";
import { IMyContext } from "@/interfaces/IMyContext";

export const helpCommand = async (ctx: IMyContext): Promise<void> => {
  await showBotAction(ctx, "typing");
  await ctx.reply(Messages.help());
};
