import {
  parseISO,
  format,
  isAfter,
  isBefore,
  isEqual,
  addDays,
  startOfDay,
  endOfDay,
  eachDayOfInterval,
  getDay,
} from "date-fns";

export interface TimeSlot {
  date: Date;
  startTime: string;
  endTime: string;
}

export interface ConflictInfo {
  date: Date;
  startTime: string;
  endTime: string;
  conflictType: "BOOKING" | "RECURRING" | "BLOCK" | "MAINTENANCE";
  conflictId: number;
  conflictDetails?: string;
}

export interface BulkValidationResult {
  validSlots: TimeSlot[];
  conflicts: ConflictInfo[];
  holidays: TimeSlot[];
}

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

export function isTimeOverlap(
  start1: string,
  end1: string,
  start2: string,
  end2: string,
): boolean {
  const s1 = timeToMinutes(start1);
  const e1 = timeToMinutes(end1);
  const s2 = timeToMinutes(start2);
  const e2 = timeToMinutes(end2);
  return s1 < e2 && s2 < e1;
}

export function isSameDay(d1: Date, d2: Date): boolean {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

export function normalizeDate(date: Date | string): Date {
  const d = typeof date === "string" ? parseISO(date) : date;
  return startOfDay(d);
}

export function formatDateKey(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

export function expandRecurringSlots(
  dayOfWeek: number,
  startTime: string,
  endTime: string,
  startDate: Date,
  endDate: Date,
): TimeSlot[] {
  const slots: TimeSlot[] = [];
  const days = eachDayOfInterval({
    start: normalizeDate(startDate),
    end: normalizeDate(endDate),
  });

  for (const day of days) {
    if (getDay(day) === dayOfWeek) {
      slots.push({
        date: day,
        startTime,
        endTime,
      });
    }
  }

  return slots;
}

export function expandBlockSlots(
  dayOfWeek: number,
  startTime: string,
  endTime: string,
  startDate: Date,
  endDate: Date,
): TimeSlot[] {
  if (dayOfWeek === -1) {
    const slots: TimeSlot[] = [];
    const days = eachDayOfInterval({
      start: normalizeDate(startDate),
      end: normalizeDate(endDate),
    });
    for (const day of days) {
      slots.push({ date: day, startTime, endTime });
    }
    return slots;
  }
  return expandRecurringSlots(
    dayOfWeek,
    startTime,
    endTime,
    startDate,
    endDate,
  );
}

export function isDateInRange(
  date: Date,
  rangeStart: Date,
  rangeEnd: Date,
): boolean {
  const d = normalizeDate(date);
  const s = normalizeDate(rangeStart);
  const e = normalizeDate(rangeEnd);
  return (isAfter(d, s) || isEqual(d, s)) && (isBefore(d, e) || isEqual(d, e));
}

export function generateInvoiceNo(prefix: string = "INV"): string {
  const now = new Date();
  const stamp = format(now, "yyyyMMddHHmmss");
  const rand = Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, "0");
  return `${prefix}-${stamp}-${rand}`;
}
