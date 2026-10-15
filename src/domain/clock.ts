export type Clock = {
  now: () => Date;
};

export function createClock(fixedIso?: string): Clock {
  if (fixedIso) {
    const fixed = new Date(fixedIso);
    if (Number.isNaN(fixed.getTime())) {
      throw new Error(`Invalid DEMO_FIXED_NOW: ${fixedIso}`);
    }
    return { now: () => new Date(fixed.getTime()) };
  }
  return { now: () => new Date() };
}

/** Calendar date YYYY-MM-DD in the given IANA timezone for `date`. */
export function calendarDateInTimezone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  if (!y || !m || !d) throw new Error("Failed to format calendar date");
  return `${y}-${m}-${d}`;
}

export function isValidCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function compareCalendarDates(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

export function calendarDaysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const start = Date.UTC(fy, fm - 1, fd);
  const end = Date.UTC(ty, tm - 1, td);
  return Math.round((end - start) / (24 * 60 * 60 * 1000));
}
