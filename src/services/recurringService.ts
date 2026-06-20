import prisma from "../lib/prisma";
import {
  expandRecurringSlots,
  normalizeDate,
  formatDateKey,
  TimeSlot,
  ConflictInfo,
} from "../utils/date";
import { validateBulkConflicts } from "./conflictService";
import {
  calculatePrice,
  calculateRecurringDiscount,
  createInvoice,
  processRefund,
} from "./billingService";
const RecurrenceStrategy = {
  SKIP_CONFLICT: "SKIP_CONFLICT",
  ROLLBACK_ALL: "ROLLBACK_ALL",
} as const;
const BookingStatus = {
  PENDING: "PENDING",
  CONFIRMED: "CONFIRMED",
  PAID: "PAID",
  CANCELLED: "CANCELLED",
  COMPLETED: "COMPLETED",
  PAUSED: "PAUSED",
  EXCEPTION: "EXCEPTION",
} as const;
const BookingType = {
  SINGLE: "SINGLE",
  RECURRING: "RECURRING",
  BLOCK: "BLOCK",
} as const;
type RecurrenceStrategy =
  (typeof RecurrenceStrategy)[keyof typeof RecurrenceStrategy];
type BookingStatus = (typeof BookingStatus)[keyof typeof BookingStatus];
type BookingType = (typeof BookingType)[keyof typeof BookingType];

export interface CreateRecurringBookingInput {
  customerId: number;
  venueId: number;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  startDate: Date | string;
  endDate: Date | string;
  strategy: RecurrenceStrategy;
  unitPrice?: number;
  notes?: string;
  autoCreateInvoice?: boolean;
}

export interface CreateRecurringResult {
  success: boolean;
  groupId?: number;
  createdBookings: Array<{
    id: number;
    date: string;
    startTime: string;
    endTime: string;
  }>;
  conflicts: Array<{
    date: string;
    startTime: string;
    endTime: string;
    reason: string;
    conflictType: string;
  }>;
  totalAmount?: number;
  invoiceId?: number;
  rolledBack?: boolean;
}

export async function createRecurringBooking(
  input: CreateRecurringBookingInput,
): Promise<CreateRecurringResult> {
  const {
    customerId,
    venueId,
    dayOfWeek,
    startTime,
    endTime,
    startDate,
    endDate,
    strategy,
    notes,
    autoCreateInvoice = true,
  } = input;

  const sDate = normalizeDate(startDate);
  const eDate = normalizeDate(endDate);

  if (sDate > eDate) {
    throw new Error("开始日期不能晚于结束日期");
  }
  if (dayOfWeek < 0 || dayOfWeek > 6) {
    throw new Error("星期几必须在 0-6 之间");
  }

  const venue = await prisma.venue.findUnique({ where: { id: venueId } });
  if (!venue) throw new Error("场馆不存在");

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
  });
  if (!customer) throw new Error("客户不存在");

  const allSlots = expandRecurringSlots(
    dayOfWeek,
    startTime,
    endTime,
    sDate,
    eDate,
  );

  if (allSlots.length === 0) {
    throw new Error("日期范围内没有符合条件的时段");
  }

  const validation = await validateBulkConflicts({
    venueId,
    slots: allSlots,
  });

  if (
    strategy === RecurrenceStrategy.ROLLBACK_ALL &&
    validation.conflicts.length > 0
  ) {
    return {
      success: false,
      createdBookings: [],
      conflicts: validation.conflicts.map((c) => ({
        date: formatDateKey(c.date),
        startTime: c.startTime,
        endTime: c.endTime,
        reason: c.conflictDetails || "时段冲突",
        conflictType: c.conflictType,
      })),
      rolledBack: true,
    };
  }

  const validSlots = validation.validSlots;
  const unitPrice = input.unitPrice ?? Number(venue.basePrice);
  const discountRate = calculateRecurringDiscount(
    validSlots.length,
    customer.type,
  );
  const pricing = calculatePrice({
    unitPrice,
    quantity: validSlots.length,
    discountRate,
  });

  try {
    const result = await prisma.$transaction(async (tx) => {
      const group = await tx.recurringBookingGroup.create({
        data: {
          customerId,
          venueId,
          dayOfWeek,
          startTime,
          endTime,
          startDate: sDate,
          endDate: eDate,
          strategy,
          status: BookingStatus.CONFIRMED,
          unitPrice,
          discountRate,
          totalAmount: pricing.finalAmount,
          paidAmount: 0,
          notes,
        },
      });

      const createdBookings: Array<{
        id: number;
        date: string;
        startTime: string;
        endTime: string;
      }> = [];
      const bookingIds: number[] = [];

      for (const slot of validSlots) {
        const finalPrice = Math.round(unitPrice * discountRate * 100) / 100;
        const booking = await tx.booking.create({
          data: {
            customerId,
            venueId,
            bookingDate: slot.date,
            startTime: slot.startTime,
            endTime: slot.endTime,
            type: BookingType.RECURRING,
            status: BookingStatus.CONFIRMED,
            recurringGroupId: group.id,
            unitPrice,
            discountRate,
            finalPrice,
            paidAmount: 0,
            notes,
          },
        });
        bookingIds.push(booking.id);
        createdBookings.push({
          id: booking.id,
          date: formatDateKey(slot.date),
          startTime: slot.startTime,
          endTime: slot.endTime,
        });
      }

      let invoiceId: number | undefined;
      if (autoCreateInvoice && bookingIds.length > 0) {
        const invoice = await createInvoice(
          customerId,
          BookingType.RECURRING,
          pricing.finalAmount,
          bookingIds,
          notes,
          tx,
        );
        invoiceId = invoice?.id;
      }

      return {
        group,
        createdBookings,
        bookingIds,
        invoiceId,
        totalAmount: pricing.finalAmount,
      };
    });

    return {
      success: true,
      groupId: result.group.id,
      createdBookings: result.createdBookings,
      conflicts: validation.conflicts.map((c) => ({
        date: formatDateKey(c.date),
        startTime: c.startTime,
        endTime: c.endTime,
        reason: c.conflictDetails || "时段冲突",
        conflictType: c.conflictType,
      })),
      totalAmount: result.totalAmount,
      invoiceId: result.invoiceId,
    };
  } catch (error) {
    return {
      success: false,
      createdBookings: [],
      conflicts: [
        {
          date: formatDateKey(sDate),
          startTime,
          endTime,
          reason: error instanceof Error ? error.message : "创建失败",
          conflictType: "SYSTEM",
        },
      ],
    };
  }
}

export async function pauseRecurringBookings(
  groupId: number,
  pauseStartDate: Date | string,
  pauseEndDate: Date | string,
) {
  const group = await prisma.recurringBookingGroup.findUnique({
    where: { id: groupId },
  });
  if (!group) throw new Error("周期预订组不存在");

  const pStart = normalizeDate(pauseStartDate);
  const pEnd = normalizeDate(pauseEndDate);

  const bookingsToPause = await prisma.booking.findMany({
    where: {
      recurringGroupId: groupId,
      bookingDate: { gte: pStart, lte: pEnd },
      status: { in: ["CONFIRMED", "PAID"] },
    },
  });

  const result = await prisma.$transaction(async (tx) => {
    const exceptionPromises = bookingsToPause.map((b) =>
      tx.recurringException.create({
        data: {
          groupId,
          originalDate: b.bookingDate,
          action: "PAUSED",
          reason: "批量暂停",
          relatedBookingId: b.id,
        },
      }),
    );
    await Promise.all(exceptionPromises);

    await tx.booking.updateMany({
      where: {
        recurringGroupId: groupId,
        bookingDate: { gte: pStart, lte: pEnd },
        status: { in: ["CONFIRMED", "PAID"] },
      },
      data: { status: BookingStatus.PAUSED },
    });

    return bookingsToPause.length;
  });

  return {
    pausedCount: result,
    pausedDates: bookingsToPause.map((b) => formatDateKey(b.bookingDate)),
  };
}

export async function postponeRecurringBookings(
  groupId: number,
  fromDate: Date | string,
  daysToPostpone: number,
  reason?: string,
) {
  const group = await prisma.recurringBookingGroup.findUnique({
    where: { id: groupId },
  });
  if (!group) throw new Error("周期预订组不存在");

  const startFrom = normalizeDate(fromDate);

  const affectedBookings = await prisma.booking.findMany({
    where: {
      recurringGroupId: groupId,
      bookingDate: { gte: startFrom },
      status: { in: ["CONFIRMED", "PAID"] },
    },
    orderBy: { bookingDate: "desc" },
  });

  if (affectedBookings.length === 0) {
    return { postponedCount: 0 };
  }

  const newSlots: TimeSlot[] = affectedBookings.map((b) => {
    const newDate = new Date(b.bookingDate);
    newDate.setDate(newDate.getDate() + daysToPostpone);
    return {
      date: newDate,
      startTime: b.startTime,
      endTime: b.endTime,
    };
  });

  const existingBookingIds = affectedBookings.map((b) => b.id);
  const validation = await validateBulkConflicts({
    venueId: group.venueId,
    slots: newSlots,
    excludeBookingIds: existingBookingIds,
    excludeRecurringGroupId: groupId,
  });

  if (validation.conflicts.length > 0) {
    return {
      postponedCount: 0,
      success: false,
      conflicts: validation.conflicts.map((c) => ({
        date: formatDateKey(c.date),
        reason: c.conflictDetails || "时段冲突",
      })),
    };
  }

  const result = await prisma.$transaction(async (tx) => {
    let count = 0;
    for (const booking of affectedBookings) {
      const newDate = new Date(booking.bookingDate);
      newDate.setDate(newDate.getDate() + daysToPostpone);

      await tx.recurringException.create({
        data: {
          groupId,
          originalDate: booking.bookingDate,
          action: "RESCHEDULED",
          newDate,
          newStartTime: booking.startTime,
          newEndTime: booking.endTime,
          reason: reason || "顺延",
          relatedBookingId: booking.id,
        },
      });

      await tx.booking.update({
        where: { id: booking.id },
        data: { bookingDate: newDate, status: BookingStatus.EXCEPTION },
      });
      count++;
    }
    return count;
  });

  return { postponedCount: result, success: true };
}

export async function cancelRecurringGroup(
  groupId: number,
  refund: boolean = true,
) {
  const group = await prisma.recurringBookingGroup.findUnique({
    where: { id: groupId },
    include: { bookings: true },
  });
  if (!group) throw new Error("周期预订组不存在");

  const activeBookings = group.bookings.filter((b) =>
    ["CONFIRMED", "PAID", "PENDING"].includes(b.status),
  );

  await prisma.$transaction(async (tx) => {
    await tx.recurringBookingGroup.update({
      where: { id: groupId },
      data: { status: BookingStatus.CANCELLED },
    });

    await tx.booking.updateMany({
      where: {
        recurringGroupId: groupId,
        status: { in: ["CONFIRMED", "PAID", "PENDING"] },
      },
      data: { status: BookingStatus.CANCELLED },
    });

    if (refund) {
      for (const booking of activeBookings) {
        if (Number(booking.paidAmount) > 0) {
          await processRefund(booking.id);
        }
      }
    }
  });

  return {
    cancelled: true,
    cancelledBookingsCount: activeBookings.length,
    groupId,
  };
}

export async function endRecurringGroupEarly(
  groupId: number,
  endDate: Date | string,
) {
  const group = await prisma.recurringBookingGroup.findUnique({
    where: { id: groupId },
  });
  if (!group) throw new Error("周期预订组不存在");

  const newEnd = normalizeDate(endDate);

  const bookingsToCancel = await prisma.booking.findMany({
    where: {
      recurringGroupId: groupId,
      bookingDate: { gt: newEnd },
      status: { in: ["CONFIRMED", "PAID", "PENDING"] },
    },
  });

  await prisma.$transaction(async (tx) => {
    await tx.recurringBookingGroup.update({
      where: { id: groupId },
      data: { endDate: newEnd },
    });

    for (const b of bookingsToCancel) {
      await tx.recurringException.create({
        data: {
          groupId,
          originalDate: b.bookingDate,
          action: "CANCELLED",
          reason: "提前结束周期预订",
          relatedBookingId: b.id,
        },
      });

      await tx.booking.update({
        where: { id: b.id },
        data: { status: BookingStatus.CANCELLED },
      });

      if (Number(b.paidAmount) > 0) {
        await processRefund(b.id);
      }
    }
  });

  return {
    newEndDate: formatDateKey(newEnd),
    cancelledBookings: bookingsToCancel.length,
  };
}

export async function createSingleException(
  groupId: number,
  originalDate: Date | string,
  action: "PAUSED" | "RESCHEDULED" | "CANCELLED",
  options?: {
    newDate?: Date | string;
    newStartTime?: string;
    newEndTime?: string;
    reason?: string;
  },
) {
  const group = await prisma.recurringBookingGroup.findUnique({
    where: { id: groupId },
  });
  if (!group) throw new Error("周期预订组不存在");

  const origDate = normalizeDate(originalDate);

  const booking = await prisma.booking.findFirst({
    where: {
      recurringGroupId: groupId,
      bookingDate: origDate,
    },
  });

  if (!booking) {
    throw new Error("该日期没有找到对应的预订");
  }

  if (action === "RESCHEDULED") {
    if (!options?.newDate || !options?.newStartTime || !options?.newEndTime) {
      throw new Error("改期必须提供新的日期和时段");
    }

    const newD = normalizeDate(options.newDate);
    const validation = await validateBulkConflicts({
      venueId: group.venueId,
      slots: [
        {
          date: newD,
          startTime: options.newStartTime,
          endTime: options.newEndTime,
        },
      ],
      excludeBookingIds: [booking.id],
      excludeRecurringGroupId: groupId,
    });

    if (validation.conflicts.length > 0) {
      throw new Error(`新时段冲突: ${validation.conflicts[0].conflictDetails}`);
    }

    await prisma.$transaction(async (tx) => {
      await tx.recurringException.create({
        data: {
          groupId,
          originalDate: origDate,
          action,
          newDate: newD,
          newStartTime: options!.newStartTime,
          newEndTime: options!.newEndTime,
          reason: options?.reason || "单次改期",
          relatedBookingId: booking.id,
        },
      });

      await tx.booking.update({
        where: { id: booking.id },
        data: {
          bookingDate: newD,
          startTime: options!.newStartTime,
          endTime: options!.newEndTime,
          status: BookingStatus.EXCEPTION,
        },
      });
    });

    return {
      success: true,
      action,
      originalDate: formatDateKey(origDate),
      newDate: formatDateKey(newD),
    };
  }

  if (action === "PAUSED") {
    await prisma.$transaction(async (tx) => {
      await tx.recurringException.create({
        data: {
          groupId,
          originalDate: origDate,
          action,
          reason: options?.reason || "单次暂停",
          relatedBookingId: booking.id,
        },
      });

      await tx.booking.update({
        where: { id: booking.id },
        data: { status: BookingStatus.PAUSED },
      });
    });
    return { success: true, action, originalDate: formatDateKey(origDate) };
  }

  if (action === "CANCELLED") {
    await prisma.$transaction(async (tx) => {
      await tx.recurringException.create({
        data: {
          groupId,
          originalDate: origDate,
          action,
          reason: options?.reason || "单次取消",
          relatedBookingId: booking.id,
        },
      });

      await tx.booking.update({
        where: { id: booking.id },
        data: { status: BookingStatus.CANCELLED },
      });

      if (Number(booking.paidAmount) > 0) {
        await processRefund(booking.id);
      }
    });
    return { success: true, action, originalDate: formatDateKey(origDate) };
  }

  throw new Error("不支持的操作类型");
}

export async function getRecurringGroupDetails(groupId: number) {
  const group = await prisma.recurringBookingGroup.findUnique({
    where: { id: groupId },
    include: {
      customer: true,
      venue: true,
      bookings: { orderBy: { bookingDate: "asc" } },
      exceptions: { orderBy: { originalDate: "asc" } },
    },
  });

  if (!group) throw new Error("周期预订组不存在");
  return group;
}

export async function listRecurringGroups(filters?: {
  venueId?: number;
  customerId?: number;
  status?: BookingStatus;
}) {
  return prisma.recurringBookingGroup.findMany({
    where: filters || {},
    include: {
      customer: true,
      venue: true,
      _count: { select: { bookings: true, exceptions: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}
