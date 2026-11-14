import { Middleware } from "telegraf";
import { IMyContext } from "@/interfaces/IMyContext";
import { MESSAGES } from "@/constants";
import logger from "@/config/logger";

const MAX_QUEUED_PER_USER = 5;

interface UserQueue {
  tail: Promise<void>;
  size: number;
}

const queues = new Map<number, UserQueue>();

/**
 * Processes updates in the background so that a long download never blocks
 * polling (Telegraf awaits the whole batch) or the webhook response.
 *
 * Updates of the same user run one after another, so a new link can't
 * clobber the scene/session state of a download that is still running.
 *
 * Must be registered before any other middleware (including session).
 */
export const createBackgroundQueueMiddleware = (
  onError: (error: unknown, ctx: IMyContext) => Promise<void>,
): Middleware<IMyContext> => {
  return (ctx, next) => {
    const run = () => next().catch((error: unknown) => onError(error, ctx));

    const key = ctx.from?.id ?? ctx.chat?.id;
    if (key === undefined) {
      void run();
      return Promise.resolve();
    }

    const queue = queues.get(key) ?? { tail: Promise.resolve(), size: 0 };

    if (queue.size >= MAX_QUEUED_PER_USER) {
      logger.warning("User queue is full, dropping update", {
        userId: key,
        updateType: ctx.updateType,
      });
      const notify = ctx.callbackQuery
        ? ctx.answerCbQuery(MESSAGES.ERROR.QUEUE_FULL)
        : ctx.reply(MESSAGES.ERROR.QUEUE_FULL);
      notify.catch(() => {});
      return Promise.resolve();
    }

    queue.size++;
    queue.tail = queue.tail.then(run).finally(() => {
      queue.size--;
      if (queue.size === 0 && queues.get(key) === queue) {
        queues.delete(key);
      }
    });
    queues.set(key, queue);

    // Resolve immediately, the update keeps running in the background
    return Promise.resolve();
  };
};

/**
 * Number of users with updates being processed (for monitoring)
 */
export const getActiveQueueCount = (): number => queues.size;
