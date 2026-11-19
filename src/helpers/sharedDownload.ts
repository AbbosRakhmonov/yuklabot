import { deliveryInfo } from "@/utils/requestHistory";
import { AsyncLocalStorage } from "node:async_hooks";
import { IMyContext } from "@/interfaces/IMyContext";
import { ProgressMessage } from "@/utils/progressMessage";
import { InlineKeyboardMarkup, Message } from "telegraf/types";
import { AlbumDeliveryError } from "@/utils/errors";
import { currentDeliveryStage, deliveryStage } from "@/utils/deliveryAttempt";
import { ProcessCancelledError } from "@/utils/processManager";

interface VideoPart {
  fileId: string;
  caption?: string;
  markup?: InlineKeyboardMarkup;
}
const videoParts = new AsyncLocalStorage<VideoPart[]>();
interface Flight {
  result: Promise<VideoPart[]>;
  failedAt?: ReturnType<typeof currentDeliveryStage>;
}
const pending = new Map<string, Flight>();

// Keep Telegram references only for the lifetime of this flight, including when
// the first recipient has no Mongo user record to attach a cache entry to.
export function rememberVideo(message: Message.VideoMessage, markup?: InlineKeyboardMarkup) {
  videoParts.getStore()?.push({ fileId: message.video.file_id, caption: message.caption, markup });
}

async function waitForProducer(ctx: IMyContext, flight: Flight) {
  deliveryStage("telegram");
  const notice = await ProgressMessage.send(ctx, "Media tayyorlanmoqda. Tayyor bo‘lgach sizga ham yuboriladi.");
  let cancel!: () => void;
  const cancelled = new Promise<never>((_, reject) => {
    cancel = () => reject(new ProcessCancelledError());
    if (notice.signal.aborted) cancel();
    else notice.signal.addEventListener("abort", cancel, { once: true });
  });
  try {
    const result = flight.result.catch(error => {
      if (flight.failedAt && flight.failedAt !== "telegram" && !(error instanceof ProcessCancelledError)) {
        deliveryStage(flight.failedAt);
        throw error;
      }
      return undefined;
    });
    return await Promise.race([result, cancelled]);
  } finally {
    notice.signal.removeEventListener("abort", cancel);
    await notice.delete();
  }
}

// The producer publishes its Telegram references before releasing the key.
// Waiters deliver to their own chats and keep their own reply parameters.
export async function sharedDownload(
  ctx: IMyContext,
  identity: readonly (string | number)[],
  sendCached: (preferFileId: boolean) => Promise<unknown>,
  produce: () => Promise<void>,
): Promise<void> {
  const key = JSON.stringify(identity);
  let waited = false;
  for (;;) {
    const running = pending.get(key);
    if (running) {
      const parts = await waitForProducer(ctx, running);
      waited = true;
      deliveryStage("telegram");
      if (await sendCached(true)) return;
      if (parts?.length) {
        deliveryInfo({ mode: "cached" });
        let sent = 0;
        for (const part of parts) {
          try {
            await ctx.replyWithVideo(part.fileId, { caption: part.caption, reply_markup: part.markup, supports_streaming: true });
            sent++;
          } catch (error) {
            if (sent) throw new AlbumDeliveryError(sent, parts.length);
            throw error;
          }
        }
        return;
      }
      continue;
    }
    const parts: VideoPart[] = [];
    const job = videoParts.run(parts, async () => {
      deliveryStage("telegram");
      if (await sendCached(waited)) return parts;
      deliveryStage("source");
      deliveryInfo({ mode: "fresh" });
      await produce();
      return parts;
    }).catch(error => {
      flight.failedAt = currentDeliveryStage();
      throw error;
    }).finally(() => pending.delete(key));
    const flight: Flight = { result: job };
    pending.set(key, flight);
    await job;
    return;
  }
}
