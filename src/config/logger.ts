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

// Define log format
const logFormat = winston.format.combine(
  winston.format.colorize({ all: true }),
  winston.format.errors({ stack: true }),
  timestampFormat(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(meta).length > 0) {
      msg += ` ${JSON.stringify(meta)}`;
    }
    return msg;
  })
  // winston.format.json()
);

// Console format for development
// const consoleFormat = winston.format.combine(
//   winston.format.printf(({ timestamp, level, message, ...meta }) => {
//     let msg = `${timestamp} [${level}]: ${message}`;
//     if (Object.keys(meta).length > 0) {
//       msg += ` ${JSON.stringify(meta)}`;
//     }
//     return msg;
//   })
// );

const logLevels = {
  error: 0,
  warning: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Create logger instance
const logger = winston.createLogger({
  levels: logLevels,
  level: config.logLevel,
  format: logFormat,
  transports: [new winston.transports.Console()],
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
  format: logFormat,
});

logger.add(fileRotateTransport);

export default logger;
