import { MESSAGES } from "@/constants";
import { IMyContext } from "@/interfaces/IMyContext";
import { CANCEL_BUTTON_CALLBACK } from "@/scenes/youtube/constants";

/**
 * Leaves the scene if the cancel button was pressed.
 * @returns true if the scene was cancelled and the caller must stop
 */
export const handleCancelButton = async (
  ctx: IMyContext,
  type: string,
): Promise<boolean> => {
  if (type !== CANCEL_BUTTON_CALLBACK) return false;

  try {
    await ctx.editMessageText(MESSAGES.INFO.SCENE_CANCELLED);
  } catch {
    // Photo messages (e.g. YouTube quality menu) have no text to edit
    await ctx.deleteMessage().catch(() => {});
    await ctx.reply(MESSAGES.INFO.SCENE_CANCELLED);
  }

  await ctx.scene.leave();
  return true;
};
