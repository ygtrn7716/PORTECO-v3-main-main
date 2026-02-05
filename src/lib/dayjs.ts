// src/lib/dayjs.ts
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);

// Uygulama genelinde kullanacağımız timezone
export const TR_TZ = "Europe/Istanbul";

// Her zaman İstanbul saatine göre çalışan helper
export function dayjsTR(input?: any) {
  return input ? dayjs(input).tz(TR_TZ) : dayjs().tz(TR_TZ);
}

export default dayjs;
