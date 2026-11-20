import { Middleware } from "telegraf";
import { IMyContext } from "@/interfaces/IMyContext";

// Methods that accept reply_parameters
const REPLYABLE = new Set([
  "sendMessage", "sendPhoto", "sendVideo", "sendAudio", "sendDocument",
  "sendAnimation", "sendVoice", "sendMediaGroup", "copyMessage",
]);

/**
 * In groups every answer replies to the message with the link, so it is
 * clear whose file is whose. Button presses find that message through the
 * menu, which itself was a reply to the link.
 * Telegraf makes a Telegram client per update, so the patch stays local.
 */
export const groupReplyMiddleware: Middleware<IMyContext> = async (ctx, next) => {
  const chat = ctx.chat;
  if (chat?.type !== "group" && chat?.type !== "supergroup") return next();

  const callbackMessage = ctx.callbackQuery?.message;
  const target = ctx.message?.message_id
    ?? (callbackMessage && "reply_to_message" in callbackMessage ? callbackMessage.reply_to_message?.message_id : undefined);
  if (!target) return next();

  const api = ctx.telegram;
  const call = api.callApi.bind(api);
  api.callApi = ((method, payload, options) => {
    const body = payload as Record<string, unknown>;
    if (REPLYABLE.has(method) && body.chat_id === chat.id && !body.reply_parameters && !body.reply_to_message_id) {
      payload = { ...body, reply_parameters: { message_id: target, allow_sending_without_reply: true } } as typeof payload;
    }
    return call(method, payload, options);
  }) as typeof api.callApi;

  return next();
};
