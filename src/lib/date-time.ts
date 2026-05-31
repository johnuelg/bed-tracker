export const SAUDI_TIMEZONE = "Asia/Riyadh";

const pad2 = (value: number) => String(value).padStart(2, "0");

const getSaudiDateTimeParts = (value: Date) => {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: SAUDI_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(value);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  const hour = parts.find((part) => part.type === "hour")?.value;
  const minute = parts.find((part) => part.type === "minute")?.value;

  if (!year || !month || !day || !hour || !minute) {
    throw new Error("Could not derive Saudi Arabia date/time parts");
  }

  return { year, month, day, hour, minute };
};

export const getSaudiIsoDate = (value = new Date()) => {
  const { year, month, day } = getSaudiDateTimeParts(value);
  return `${year}-${month}-${day}`;
};

export const getSaudiTime24 = (value = new Date()) => {
  const { hour, minute } = getSaudiDateTimeParts(value);
  return `${hour}:${minute}`;
};

export const isoDateToCalendarDate = (isoDate: string) => {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1, 12, 0, 0, 0);
};

export const calendarDateToIsoDate = (value: Date) => {
  return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`;
};

export const formatSaudiDateTime = (value: Date, options: Intl.DateTimeFormatOptions) => {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: SAUDI_TIMEZONE,
    ...options,
  }).format(value);
};

export const parseSaudiDateTimeInput = (value: string) => {
  const normalized = value.trim();
  const match = normalized.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/);
  return match ? { date: match[1], time: match[2] } : null;
};

export const getSaudiWeekdayShortFromIsoDate = (isoDate: string) => {
  return formatSaudiDateTime(new Date(`${isoDate}T12:00:00+03:00`), { weekday: "short" });
};

export const formatSaudiIsoDateForDisplay = (
  isoDate: string,
  options: Intl.DateTimeFormatOptions = { year: "numeric", month: "long", day: "numeric" },
) => {
  return formatSaudiDateTime(new Date(`${isoDate}T12:00:00+03:00`), options);
};