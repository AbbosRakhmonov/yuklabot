import { Message } from "telegraf/types";

/**
 * file_id of the media in a sent message (largest size for photos)
 */
export const getMessageFileId = (message: Message): string | undefined => {
  if ("video" in message) return message.video.file_id;
  if ("audio" in message) return message.audio.file_id;
  if ("photo" in message) return message.photo.at(-1)?.file_id;
  if ("animation" in message) return message.animation.file_id;
  if ("document" in message) return message.document.file_id;
  return undefined;
};
