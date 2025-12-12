import logger from "../config/logger";
import { IMyContext } from "@/interfaces/IMyContext";

export type BotActionType =
  | "typing"
  | "upload_photo"
  | "record_video"
  | "upload_video"
  | "record_voice"
  | "upload_voice"
  | "upload_document"
  | "choose_sticker"
  | "find_location"
  | "record_video_note"
  | "upload_video_note";

/**
 * Shows a bot action (typing, uploading, etc.) based on the message type
 * @param ctx - IMyContext
 * @param action - The type of action to show (default: 'typing')
 * @returns Promise that resolves when the action is sent
 */
export const showBotAction = async (
  ctx: IMyContext,
  action: BotActionType = "typing"
) => {
  try {
    await ctx.sendChatAction(action);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error showing bot action ${action}`, {
      error: errorMessage,
      action,
    });
  }
};
