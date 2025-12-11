import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { config } from "../config/config";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault(config.timezone);

export const myDayjs = dayjs;
