import dayjs from "dayjs";
import { config } from "../config/config";
import { myDayjs } from "./myDayjs";

/**
 * Format a date in the configured timezone
 * @param date - Date to format (optional, defaults to now)
 * @param format - Format string (default: "YYYY-MM-DD HH:mm:ss")
 * @returns Formatted date string
 */

export const formatDate = (
  date?: string | Date | dayjs.Dayjs,
  format = "YYYY-MM-DD HH:mm:ss Z",
  timezone?: string
): string => {
  return myDayjs(date)
    .tz(timezone || config.timezone)
    .format(format);
};

export default dayjs;
