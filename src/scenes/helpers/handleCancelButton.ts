import { MESSAGES } from "@/constants";
import { IMyContext } from "@/interfaces/IMyContext";
import { CANCEL_BUTTON_CALLBACK } from "@/scenes/youtube/constants";

export const handleCancelButton = async (ctx: IMyContext, type: string) => {
  if (type === CANCEL_BUTTON_CALLBACK) {
    await ctx.editMessageText(MESSAGES.INFO.SCENE_CANCELLED);
    return ctx.scene.leave();
  }
};
