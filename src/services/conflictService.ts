import prisma from "../lib/prisma";
import {
  TimeSlot,
  ConflictInfo,
  BulkValidationResult,
  isTimeOverlap,
  isDateInRange,
  normalizeDate,
  formatDateKey,
  expandRecurringSlots,
  expandBlockSlots,
  isSameDay,
} from "../utils/date";

export interface ValidationContext {
  venueId: number;
  slots: TimeSlot[];
  excludeRecurringGroupId?: number;
  excludeBlockBookingId?: number;
  excludeBookingIds?: number[];
}

export async function validateBulkConflicts(
  ctx: ValidationContext,
): Promise<BulkValidationResult> {
  const {
    venueId,
    slots,
    excludeRecurringGroupId,
    excludeBlockBookingId,
    excludeBookingIds = [],
  } = ctx;

  if (slots.length === 0) {
    return { validSlots: [], conflicts: [], holidays: [] };
  }

  const dateSet = new Set(slots.map((s) => formatDateKey(s.date)));
  const sortedDates = Array.from(dateSet).sort();
  const minDate = normalizeDate(sortedDates[0]);
  const maxDate = normalizeDate(sortedDates[sortedDates.length - 1]);

  const [bookings, recurringGroups, blockBookings, maintenances] =
    await Promise.all([
      prisma.booking.findMany({
        where: {
          venueId,
          bookingDate: { gte: minDate, lte: maxDate },
          status: {
            in: ["PENDING", "CONFIRMED", "PAID", "COMPLETED", "PAUSED"],
          },
          id: { notIn: excludeBookingIds },
        },
        select: {
          id: true,
          bookingDate: true,
          startTime: true,
          endTime: true,
          status: true,
          recurringGroupId: true,
          blockBookingId: true,
          type: true,
        },
      }),
      prisma.recurringBookingGroup.findMany({
        where: {
          venueId,
          status: { in: ["CONFIRMED", "PAID", "PAUSED"] },
          startDate: { lte: maxDate },
          endDate: { gte: minDate },
          NOT: excludeRecurringGroupId
            ? { id: excludeRecurringGroupId }
            : undefined,
        },
        select: {
          id: true,
          dayOfWeek: true,
          startTime: true,
          endTime: true,
          startDate: true,
          endDate: true,
          status: true,
        },
      }),
      prisma.blockBooking.findMany({
        where: {
          venueId,
          status: { in: ["CONFIRMED", "PAID"] },
          startDate: { lte: maxDate },
          endDate: { gte: minDate },
          NOT: excludeBlockBookingId
            ? { id: excludeBlockBookingId }
            : undefined,
        },
        select: {
          id: true,
          dayOfWeek: true,
          startTime: true,
          endTime: true,
          startDate: true,
          endDate: true,
          name: true,
        },
      }),
      prisma.venueMaintenance.findMany({
        where: {
          venueId,
          startDate: { lte: maxDate },
          endDate: { gte: minDate },
        },
        select: {
          id: true,
          startDate: true,
          endDate: true,
          reason: true,
        },
      }),
    ]);

  const bookingMap = new Map<string, typeof bookings>();
  for (const b of bookings) {
    const key = formatDateKey(b.bookingDate);
    if (!bookingMap.has(key)) bookingMap.set(key, []);
    bookingMap.get(key)!.push(b);
  }

  const maintenanceMap = new Map<string, typeof maintenances>();
  for (const m of maintenances) {
    const s = normalizeDate(m.startDate);
    const e = normalizeDate(m.endDate);
    for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
      const key = formatDateKey(d);
      if (!maintenanceMap.has(key)) maintenanceMap.set(key, []);
      maintenanceMap.get(key)!.push(m);
    }
  }

  const allRecurringExpanded: Array<{
    date: Date;
    startTime: string;
    endTime: string;
    groupId: number;
  }> = [];
  for (const rg of recurringGroups) {
    const expanded = expandRecurringSlots(
      rg.dayOfWeek,
      rg.startTime,
      rg.endTime,
      new Date(
        Math.max(normalizeDate(rg.startDate).getTime(), minDate.getTime()),
      ),
      new Date(
        Math.min(normalizeDate(rg.endDate).getTime(), maxDate.getTime()),
      ),
    );
    for (const slot of expanded) {
      allRecurringExpanded.push({ ...slot, groupId: rg.id });
    }
  }

  const recurringMap = new Map<string, typeof allRecurringExpanded>();
  for (const r of allRecurringExpanded) {
    const key = formatDateKey(r.date);
    if (!recurringMap.has(key)) recurringMap.set(key, []);
    recurringMap.get(key)!.push(r);
  }

  const allBlockExpanded: Array<{
    date: Date;
    startTime: string;
    endTime: string;
    blockId: number;
    name: string;
  }> = [];
  for (const bb of blockBookings) {
    const expanded = expandBlockSlots(
      bb.dayOfWeek,
      bb.startTime,
      bb.endTime,
      new Date(
        Math.max(normalizeDate(bb.startDate).getTime(), minDate.getTime()),
      ),
      new Date(
        Math.min(normalizeDate(bb.endDate).getTime(), maxDate.getTime()),
      ),
    );
    for (const slot of expanded) {
      allBlockExpanded.push({ ...slot, blockId: bb.id, name: bb.name });
    }
  }

  const blockMap = new Map<string, typeof allBlockExpanded>();
  for (const b of allBlockExpanded) {
    const key = formatDateKey(b.date);
    if (!blockMap.has(key)) blockMap.set(key, []);
    blockMap.get(key)!.push(b);
  }

  const validSlots: TimeSlot[] = [];
  const conflicts: ConflictInfo[] = [];

  for (const slot of slots) {
    const dateKey = formatDateKey(slot.date);
    let hasConflict = false;

    const dayBookings = bookingMap.get(dateKey) || [];
    for (const b of dayBookings) {
      if (isTimeOverlap(slot.startTime, slot.endTime, b.startTime, b.endTime)) {
        hasConflict = true;
        conflicts.push({
          date: slot.date,
          startTime: slot.startTime,
          endTime: slot.endTime,
          conflictType: b.recurringGroupId
            ? "RECURRING"
            : b.blockBookingId
              ? "BLOCK"
              : "BOOKING",
          conflictId: b.id,
          conflictDetails: `已有预订 ${b.type} (${b.startTime}-${b.endTime}) 状态:${b.status}`,
        });
        break;
      }
    }
    if (hasConflict) continue;

    const dayRecurring = recurringMap.get(dateKey) || [];
    for (const r of dayRecurring) {
      if (isTimeOverlap(slot.startTime, slot.endTime, r.startTime, r.endTime)) {
        hasConflict = true;
        conflicts.push({
          date: slot.date,
          startTime: slot.startTime,
          endTime: slot.endTime,
          conflictType: "RECURRING",
          conflictId: r.groupId,
          conflictDetails: `周期预订组 #${r.groupId} (${r.startTime}-${r.endTime})`,
        });
        break;
      }
    }
    if (hasConflict) continue;

    const dayBlocks = blockMap.get(dateKey) || [];
    for (const b of dayBlocks) {
      if (isTimeOverlap(slot.startTime, slot.endTime, b.startTime, b.endTime)) {
        hasConflict = true;
        conflicts.push({
          date: slot.date,
          startTime: slot.startTime,
          endTime: slot.endTime,
          conflictType: "BLOCK",
          conflictId: b.blockId,
          conflictDetails: `包场 ${b.name} (${b.startTime}-${b.endTime})`,
        });
        break;
      }
    }
    if (hasConflict) continue;

    const dayMaintenances = maintenanceMap.get(dateKey) || [];
    for (const m of dayMaintenances) {
      const mStart = normalizeDate(m.startDate);
      const mEnd = normalizeDate(m.endDate);
      if (isDateInRange(slot.date, mStart, mEnd)) {
        hasConflict = true;
        conflicts.push({
          date: slot.date,
          startTime: slot.startTime,
          endTime: slot.endTime,
          conflictType: "MAINTENANCE",
          conflictId: m.id,
          conflictDetails: `场馆维护 ${m.reason || ""} (${formatDateKey(m.startDate)} ~ ${formatDateKey(m.endDate)})`,
        });
        break;
      }
    }
    if (hasConflict) continue;

    validSlots.push(slot);
  }

  return { validSlots, conflicts, holidays: [] };
}

export async function validateSingleSlotConflict(
  venueId: number,
  date: Date,
  startTime: string,
  endTime: string,
  excludeBookingId?: number,
): Promise<ConflictInfo | null> {
  const result = await validateBulkConflicts({
    venueId,
    slots: [{ date, startTime, endTime }],
    excludeBookingIds: excludeBookingId ? [excludeBookingId] : [],
  });
  return result.conflicts[0] || null;
}

export async function getBlockedSlotsForVenue(
  venueId: number,
  startDate: Date,
  endDate: Date,
): Promise<
  Array<{
    date: Date;
    startTime: string;
    endTime: string;
    source: string;
    name: string;
  }>
> {
  const result: Array<{
    date: Date;
    startTime: string;
    endTime: string;
    source: string;
    name: string;
  }> = [];

  const [bookings, recurringGroups, blockBookings, maintenances] =
    await Promise.all([
      prisma.booking.findMany({
        where: {
          venueId,
          bookingDate: {
            gte: normalizeDate(startDate),
            lte: normalizeDate(endDate),
          },
          status: { in: ["PENDING", "CONFIRMED", "PAID", "COMPLETED"] },
        },
        select: {
          id: true,
          bookingDate: true,
          startTime: true,
          endTime: true,
          type: true,
        },
      }),
      prisma.recurringBookingGroup.findMany({
        where: {
          venueId,
          status: { in: ["CONFIRMED", "PAID"] },
          startDate: { lte: endDate },
          endDate: { gte: startDate },
        },
        select: {
          id: true,
          dayOfWeek: true,
          startTime: true,
          endTime: true,
          startDate: true,
          endDate: true,
        },
      }),
      prisma.blockBooking.findMany({
        where: {
          venueId,
          status: { in: ["CONFIRMED", "PAID"] },
          startDate: { lte: endDate },
          endDate: { gte: startDate },
        },
        select: {
          id: true,
          dayOfWeek: true,
          startTime: true,
          endTime: true,
          startDate: true,
          endDate: true,
          name: true,
        },
      }),
      prisma.venueMaintenance.findMany({
        where: {
          venueId,
          startDate: { lte: endDate },
          endDate: { gte: startDate },
        },
        select: { id: true, startDate: true, endDate: true, reason: true },
      }),
    ]);

  for (const b of bookings) {
    result.push({
      date: b.bookingDate,
      startTime: b.startTime,
      endTime: b.endTime,
      source: "BOOKING",
      name: `预订#${b.id}`,
    });
  }

  for (const rg of recurringGroups) {
    const expanded = expandRecurringSlots(
      rg.dayOfWeek,
      rg.startTime,
      rg.endTime,
      new Date(
        Math.max(
          normalizeDate(rg.startDate).getTime(),
          normalizeDate(startDate).getTime(),
        ),
      ),
      new Date(
        Math.min(
          normalizeDate(rg.endDate).getTime(),
          normalizeDate(endDate).getTime(),
        ),
      ),
    );
    for (const s of expanded) {
      result.push({
        date: s.date,
        startTime: s.startTime,
        endTime: s.endTime,
        source: "RECURRING",
        name: `周期预订#${rg.id}`,
      });
    }
  }

  for (const bb of blockBookings) {
    const expanded = expandBlockSlots(
      bb.dayOfWeek,
      bb.startTime,
      bb.endTime,
      new Date(
        Math.max(
          normalizeDate(bb.startDate).getTime(),
          normalizeDate(startDate).getTime(),
        ),
      ),
      new Date(
        Math.min(
          normalizeDate(bb.endDate).getTime(),
          normalizeDate(endDate).getTime(),
        ),
      ),
    );
    for (const s of expanded) {
      result.push({
        date: s.date,
        startTime: s.startTime,
        endTime: s.endTime,
        source: "BLOCK",
        name: bb.name,
      });
    }
  }

  for (const m of maintenances) {
    const s = normalizeDate(m.startDate);
    const e = normalizeDate(m.endDate);
    for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
      result.push({
        date: new Date(d),
        startTime: "00:00",
        endTime: "23:59",
        source: "MAINTENANCE",
        name: m.reason || "维护",
      });
    }
  }

  return result;
}
