import { AsyncLocalStorage } from "node:async_hooks";
import { currentRequestId, deliveryInfo, traceEvent, traceOutcome } from "./requestHistory";
import DeliveryAttempt from "@/models/DeliveryAttempt";
import { IMyContext } from "@/interfaces/IMyContext";
import { EPlatform } from "@/enums/EPlatform";
import { AlbumDeliveryError } from "./errors";
import { ProcessCancelledError } from "./processManager";
import logger from "@/config/logger";
import { MESSAGES } from "@/constants";
import { TelegramError } from "telegraf";

type Stage = "source" | "processing" | "telegram";
const current = new AsyncLocalStorage<{ stage: Stage; delivered: boolean }>();

export function deliveryStage(stage: Stage) {
  const attempt = current.getStore();
  if (attempt) { attempt.stage = stage; traceEvent(stage); }
}
export function deliveryConfirmed() {
  const attempt = current.getStore();
  if (attempt) attempt.delivered = true;
}

export function currentDeliveryStage(): Stage {
  return current.getStore()?.stage ?? "source";
}

function failureReason(error: unknown, stage: Stage): string {
  if (error instanceof AlbumDeliveryError) return "partial";
  if (error instanceof TelegramError && error.code === 429) return "telegram_limit";
  if (error instanceof TelegramError && error.code === 403) return "telegram_forbidden";
  if (error instanceof Error) {
    const known = MESSAGES.ERROR;
    if (error.message === known.FILE_TOO_LARGE) return "too_large";
    if (error.message === known.INSTAGRAM_PRIVATE) return "private";
    if (error.message === known.LIVE_STREAM_UNSUPPORTED) return "live";
    if (error.message === known.MEDIA_NOT_FOUND || error.message === known.INSTAGRAM_NOT_FOUND) return "missing";
    if (/timed?\s*out|ETIMEDOUT/i.test(error.message)) return "timeout";
  }
  return stage;
}

export async function observeAttempt<T>(
  ctx: IMyContext, platform: EPlatform, stage: Stage, work: () => Promise<T>,
  countSuccess: (result: T) => boolean = () => true,
): Promise<T> {
  const attempt = { stage, delivered: false };
  deliveryInfo({ platform });
  traceEvent(stage);
  const save = async (outcome: string, reason?: string) => {
    traceOutcome(outcome, reason);
    try {
      await DeliveryAttempt.updateOne({ _id: ctx.update.update_id }, {
        $setOnInsert: { platform, outcome, reason, finishedAt: new Date(),
          ...(outcome === "failed" && { requestId: currentRequestId(), userId: ctx.from?.id, stage: attempt.stage }),
        },
      }, { upsert: true });
    } catch (error) { logger.error("Could not record delivery outcome", { error }); }
  };
  return current.run(attempt, async () => {
    try {
      const result = await work();
      if (countSuccess(result)) await save("success");
      return result;
    } catch (error) {
      if (attempt.delivered) await save("success");
      else if (error instanceof ProcessCancelledError) await save("cancelled");
      else await save("failed", failureReason(error, attempt.stage));
      throw error;
    }
  });
}
