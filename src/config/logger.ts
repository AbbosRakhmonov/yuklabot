import winston from "winston";
import { formatDate } from "../utils/timezone";
import { config } from "@/config/config";
import DailyRotateFile from "winston-daily-rotate-file";
import path from "path";

const logDir = "logs";

// Custom timestamp formatter using dayjs with timezone
const timestampFormat = winston.format((info) => {
  info.timestamp = formatDate();
  return info;
});

// Error objects serialize to "{}" with plain JSON.stringify, so expand them
const serializeMeta = (meta: Record<string, unknown>): string =>
  JSON.stringify(meta, (_key, value: unknown) => {
    if (value instanceof Error) {
      return {
        ...(value as unknown as Record<string, unknown>),
        name: value.name,
        message: value.message,
        stack: value.stack,
      };
    }
    return value;
  });

const printFormat = winston.format.printf(
  ({ timestamp, level, message, ...meta }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(meta).length > 0) {
      msg += ` ${serializeMeta(meta)}`;
    }
    return msg;
  },
);

const baseFormat = winston.format.combine(
  winston.format.errors({ stack: true }),
  timestampFormat(),
);

// Colors only for the console, files stay free of ANSI codes
const consoleFormat = winston.format.combine(
  baseFormat,
  winston.format.colorize({ all: true }),
  printFormat,
);

const fileFormat = winston.format.combine(baseFormat, printFormat);

const logLevels = {
  error: 0,
  warning: 1,
  info: 2,
  http: 3,
  debug: 4,
};

const logLevel = config.logLevel in logLevels ? config.logLevel : "info";

// Create logger instance
const logger = winston.createLogger({
  levels: logLevels,
  level: logLevel,
  format: fileFormat,
  // Process exit decisions are made in index.ts, not by the logger
  exitOnError: false,
  transports: [new winston.transports.Console({ format: consoleFormat })],
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(logDir, "exceptions.log"),
    }),
  ],
  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(logDir, "rejections.log"),
    }),
  ],
});

const fileRotateTransport = new DailyRotateFile({
  filename: path.join(logDir, "application-%DATE%.log"),
  datePattern: "YYYY-MM-DD",
  zippedArchive: true,
  maxSize: "20m",
  maxFiles: "14d",
  format: fileFormat,
});

logger.add(fileRotateTransport);

if (logLevel !== config.logLevel) {
  logger.warning(
    `Unknown LOG_LEVEL "${config.logLevel}", falling back to "info". Allowed: ${Object.keys(logLevels).join(", ")}`,
  );
}

export default logger;
