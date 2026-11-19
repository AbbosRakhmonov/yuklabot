import { AsyncLocalStorage } from "node:async_hooks";
import mongoose from "mongoose";
import { IMyContext } from "@/interfaces/IMyContext";
import logger from "@/config/logger";
import { TIKTOK_AUDIO_CALLBACK_REGEX } from "@/scenes/tiktok/constants";

export interface RequestEvent {
  at: Date;
  kind: string;
  detail?: string;
}

export type DeliveryMode = "cached" | "fresh";
export interface SpeedMetrics {
  queue: number;
  preparation: number;
  telegram: number;
  choice: number;
}
export const queueTiming = new AsyncLocalStorage<{ received: number; started: number }>();

export interface RequestHistoryRow {
  metrics?: SpeedMetrics;
  platform?: string;
  mode?: DeliveryMode;
  measuredAt?: Date;
  _id: number;
  key: number;
  url?: string;
  state: string;
  receivedAt?: Date;
  startedAt?: Date;
  outcome?: string;
  notice?: string;
  noticeAt?: Date;
  events?: RequestEvent[];
}

export const requestHistory = () => mongoose.connection.collection<RequestHistoryRow>("telegram_updates");

export function requestUrl(text?: string) {
  const value = text?.trim();
  return value && /^https?:\/\/\S+$/i.test(value) && value.length <= 2048 ? value : undefined;
}

interface Trace {
  requestId: number;
  url?: string;
  events: RequestEvent[];
  outcome?: string;
  platform?: string;
  mode?: DeliveryMode;
}
const active = new AsyncLocalStorage<Trace>();
export const currentRequestId = () => active.getStore()?.requestId;
export function deliveryInfo(info: Pick<Trace, "platform" | "mode" | "url">) {
  const trace = active.getStore();
  if (trace) Object.assign(trace, info);
}

const mediaMethods = new Set(["sendPhoto", "sendVideo", "sendAudio", "sendDocument", "sendMediaGroup", "copyMessage", "copyMessages", "forwardMessage"]);

function measureSends(ctx: IMyContext, trace: Trace) {
  const api = ctx.telegram;
  let elapsed = 0, pending = 0, start = 0;
  if (api) {
    const call = api.callApi.bind(api);
    api.callApi = async (method, payload, options) => {
      if (!trace.mode || !mediaMethods.has(method)) return call(method, payload, options);
      if (pending++ === 0) start = Date.now();
      try { return await call(method, payload, options); }
      finally { if (--pending === 0) elapsed += Math.max(0, Date.now() - start); }
    };
  }
  return () => elapsed;
}
export function traceEvent(kind: string, detail?: string) {
  const trace = active.getStore();
  if (!trace || trace.events.at(-1)?.kind === kind && trace.events.at(-1)?.detail === detail) return;
  trace.events.push({ at: new Date(), kind, detail: detail?.slice(0, 500) });
}
export function traceOutcome(outcome: string, detail?: string) {
  const trace = active.getStore();
  if (!trace) return;
  if (trace.outcome && outcome === "failed" && !detail) return;
  trace.outcome = outcome;
  traceEvent(outcome, detail);
}

export async function traceRequest(ctx: IMyContext, next: () => Promise<void>) {
  const link = ctx.message && "text" in ctx.message && requestUrl(ctx.message.text);
  const callback = ctx.callbackQuery && "data" in ctx.callbackQuery && ctx.callbackQuery.data;
  const scene = ctx.session?.__scenes?.state as { requestId?: number; waitingSince?: number } | undefined;
  const standaloneAudio = callback && TIKTOK_AUDIO_CALLBACK_REGEX.test(callback);
  const id = link || standaloneAudio ? ctx.update.update_id : callback ? scene?.requestId : undefined;
  if (typeof id !== "number") return next();
  const trace: Trace = { requestId: id, events: [] };
  const telegramTime = measureSends(ctx, trace);
  const timing = queueTiming.getStore();
  const waitedSince = callback && !standaloneAudio ? scene?.waitingSince : undefined;
  const send = ctx.sendMessage.bind(ctx);
  ctx.sendMessage = async (...args) => {
    const result = await send(...args);
    traceEvent("reply", result.text);
    return result;
  };
  await active.run(trace, async () => {
    try {
      if (callback) traceEvent("choice", callback);
      await next();
    } catch (error) {
      traceOutcome("failed");
      throw error;
    } finally {
      const outcome = trace.outcome ?? (ctx.session?.__scenes?.current ? "waiting" : "ended");
      try {
        const end = Date.now();
        const remaining = ctx.session?.__scenes?.state as { requestId?: number; waitingSince?: number } | undefined;
        if (remaining?.requestId === id) remaining.waitingSince = end;
        const telegram = telegramTime();
        if (link && scene?.requestId && scene.requestId !== remaining?.requestId) {
          await requestHistory().updateOne({ _id: scene.requestId, key: ctx.from?.id, outcome: "waiting" }, {
            $set: { outcome: "replaced" }, $push: { events: { at: new Date(), kind: "replaced" } },
          });
        }
        await requestHistory().updateOne({ _id: id, key: ctx.from?.id }, {
          $set: { outcome, ...(trace.url && { url: trace.url }), ...(trace.platform && { platform: trace.platform }), ...(trace.mode && { mode: trace.mode }),
            ...(timing && outcome === "success" && trace.mode && { measuredAt: new Date(end) }) },
          ...(timing && { $inc: {
            "metrics.queue": Math.max(0, timing.started - timing.received),
            "metrics.preparation": Math.max(0, end - timing.started - telegram),
            "metrics.telegram": telegram,
            "metrics.choice": waitedSince === undefined ? 0 : Math.max(0, timing.received - waitedSince),
          } }),
          $push: { events: { $each: trace.events, $slice: -80 } },
        });
      } catch (error) { logger.error("Could not save request history", { error }); }
    }
  });
}
