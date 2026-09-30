const IST_OFFSET_MINUTES = 5 * 60 + 30;
const IST_ZONE = "Asia/Kolkata";

export function istDateTimeInputToIso(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [, yearText, monthText, dayText, hourText, minuteText] = match;
  const [year, month, day, hour, minute] = [yearText, monthText, dayText, hourText, minuteText].map(Number);
  const calendar = new Date(Date.UTC(year, month - 1, day, hour, minute));
  if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day
    || hour > 23 || minute > 59) return null;
  return new Date(Date.UTC(year, month - 1, day, hour, minute - IST_OFFSET_MINUTES)).toISOString();
}

export function isoToIstDateTimeInput(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: IST_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const fields = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${fields.year}-${fields.month}-${fields.day}T${fields.hour}:${fields.minute}`;
}

export function maintenancePreview(startAt: string, endAt: string): string {
  const startIso = istDateTimeInputToIso(startAt);
  const endIso = istDateTimeInputToIso(endAt);
  if (!startIso || !endIso) return "ELogbook is scheduled for maintenance. Please save your work beforehand, as you may experience brief interruptions during this time. Thank you for your understanding.";
  const format = (value: string) => `${new Date(value).toLocaleString("en-IN", {
    timeZone: IST_ZONE,
    dateStyle: "medium",
    timeStyle: "short",
  })} IST`;
  return `ELogbook is scheduled for maintenance from ${format(startIso)} to ${format(endIso)}. Please save your work beforehand, as you may experience brief interruptions during this time. Thank you for your understanding.`;
}
