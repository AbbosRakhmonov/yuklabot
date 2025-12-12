import { Middleware } from "telegraf";
import logger from "../config/logger";
import { myDayjs } from "../utils/myDayjs";
import { config } from "../config/config";
import { IMyContext } from "@/interfaces/IMyContext";

export const loggerMiddleware: Middleware<IMyContext> = async (
  ctx,
  next
): Promise<void> => {
  const start = myDayjs().tz(config.timezone).toDate();
  await next();
  const ms = myDayjs().diff(start, "ms");
  logger.debug(`${ctx.updateType}`, {
    updateType: ctx.updateType,
    duration: `${ms} ms`,
    userId: ctx.from?.id,
    chatId: ctx.chat?.id,
  });
};
