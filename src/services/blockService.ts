import prisma from "../lib/prisma";
import { expandBlockSlots, normalizeDate, formatDateKey } from "../utils/date";
import { validateBulkConflicts } from "./conflictService";
import {
  calculatePrice,
  calculateBlockDiscount,
  createInvoice,
} from "./billingService";
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
type BookingStatus = (typeof BookingStatus)[keyof typeof BookingStatus];
type BookingType = (typeof BookingType)[keyof typeof BookingType];

export interface CreateBlockBookingInput {
  customerId: number;
  venueId: number;
  name: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  startDate: Date | string;
  endDate: Date | string;
  unitPrice?: number;
  packagePrice?: number;
  notes?: string;
  autoCreateInvoice?: boolean;
}

export interface CreateBlockResult {
  success: boolean;
  blockBookingId?: number;
  createdBookingsCount: number;
  conflicts: Array<{
    date: string;
    startTime: string;
    endTime: string;
    reason: string;
    conflictType: string;
  }>;
  totalAmount?: number;
  invoiceId?: number;
}

export async function createBlockBooking(
  input: CreateBlockBookingInput,
): Promise<CreateBlockResult> {
  const {
    customerId,
    venueId,
    name,
    dayOfWeek,
    startTime,
    endTime,
    startDate,
    endDate,
    notes,
    autoCreateInvoice = true,
  } = input;

  const sDate = normalizeDate(startDate);
  const eDate = normalizeDate(endDate);

  if (sDate > eDate) {
    throw new Error("开始日期不能晚于结束日期");
  }
  if (dayOfWeek < -1 || dayOfWeek > 6) {
    throw new Error("星期几必须在 -1 到 6 之间（-1 表示每天）");
  }

  const venue = await prisma.venue.findUnique({ where: { id: venueId } });
  if (!venue) throw new Error("场馆不存在");

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
  });
  if (!customer) throw new Error("客户不存在");

  const allSlots = expandBlockSlots(
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

  if (validation.conflicts.length > 0) {
    return {
      success: false,
      createdBookingsCount: 0,
      conflicts: validation.conflicts.map((c) => ({
        date: formatDateKey(c.date),
        startTime: c.startTime,
        endTime: c.endTime,
        reason: c.conflictDetails || "时段冲突",
        conflictType: c.conflictType,
      })),
    };
  }

  const unitPrice = input.unitPrice ?? Number(venue.basePrice);
  const discountRate = input.packagePrice
    ? Math.round((input.packagePrice / (unitPrice * allSlots.length)) * 10000) /
      10000
    : calculateBlockDiscount(allSlots.length);

  const pricing = calculatePrice({
    unitPrice,
    quantity: allSlots.length,
    discountRate,
    packagePrice: input.packagePrice,
  });

  try {
    const result = await prisma.$transaction(async (tx) => {
      const blockBooking = await tx.blockBooking.create({
        data: {
          customerId,
          venueId,
          name,
          dayOfWeek,
          startTime,
          endTime,
          startDate: sDate,
          endDate: eDate,
          status: BookingStatus.CONFIRMED,
          packagePrice: pricing.finalAmount,
          discountRate,
          totalAmount: pricing.finalAmount,
          paidAmount: 0,
          notes,
        },
      });

      const bookingIds: number[] = [];

      for (const slot of allSlots) {
        const finalPrice = Math.round(unitPrice * discountRate * 100) / 100;
        const booking = await tx.booking.create({
          data: {
            customerId,
            venueId,
            bookingDate: slot.date,
            startTime: slot.startTime,
            endTime: slot.endTime,
            type: BookingType.BLOCK,
            status: BookingStatus.CONFIRMED,
            blockBookingId: blockBooking.id,
            unitPrice,
            discountRate,
            finalPrice,
            paidAmount: 0,
            notes,
          },
        });
        bookingIds.push(booking.id);
      }

      let invoiceId: number | undefined;
      if (autoCreateInvoice && bookingIds.length > 0) {
        const invoice = await createInvoice(
          customerId,
          BookingType.BLOCK,
          pricing.finalAmount,
          bookingIds,
          notes,
          tx,
        );
        invoiceId = invoice?.id;
      }

      return {
        blockBooking,
        bookingIds,
        invoiceId,
        totalAmount: pricing.finalAmount,
      };
    });

    return {
      success: true,
      blockBookingId: result.blockBooking.id,
      createdBookingsCount: result.bookingIds.length,
      conflicts: [],
      totalAmount: result.totalAmount,
      invoiceId: result.invoiceId,
    };
  } catch (error) {
    return {
      success: false,
      createdBookingsCount: 0,
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

export async function getBlockBookingDetails(blockBookingId: number) {
  const block = await prisma.blockBooking.findUnique({
    where: { id: blockBookingId },
    include: {
      customer: true,
      venue: true,
      bookings: { orderBy: { bookingDate: "asc" } },
    },
  });
  if (!block) throw new Error("包场不存在");
  return block;
}

export async function listBlockBookings(filters?: {
  venueId?: number;
  customerId?: number;
  status?: BookingStatus;
}) {
  return prisma.blockBooking.findMany({
    where: filters || {},
    include: {
      customer: true,
      venue: true,
      _count: { select: { bookings: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function updateBlockBookingStatus(
  blockBookingId: number,
  status: BookingStatus,
) {
  const block = await prisma.blockBooking.findUnique({
    where: { id: blockBookingId },
  });
  if (!block) throw new Error("包场不存在");

  await prisma.$transaction(async (tx) => {
    await tx.blockBooking.update({
      where: { id: blockBookingId },
      data: { status },
    });

    if (status === BookingStatus.CANCELLED) {
      await tx.booking.updateMany({
        where: { blockBookingId },
        data: { status: BookingStatus.CANCELLED },
      });
    }
  });

  return { success: true, blockBookingId, status };
}

export async function extendBlockBooking(
  blockBookingId: number,
  newEndDate: Date | string,
) {
  const block = await prisma.blockBooking.findUnique({
    where: { id: blockBookingId },
  });
  if (!block) throw new Error("包场不存在");

  const newEnd = normalizeDate(newEndDate);
  if (newEnd <= block.endDate) {
    throw new Error("新的结束日期必须晚于当前结束日期");
  }

  const extendedSlots = expandBlockSlots(
    block.dayOfWeek,
    block.startTime,
    block.endTime,
    new Date(block.endDate.getTime() + 24 * 60 * 60 * 1000),
    newEnd,
  );

  if (extendedSlots.length === 0) {
    return {
      success: true,
      extendedCount: 0,
      newEndDate: formatDateKey(newEnd),
    };
  }

  const validation = await validateBulkConflicts({
    venueId: block.venueId,
    slots: extendedSlots,
    excludeBlockBookingId: blockBookingId,
  });

  if (validation.conflicts.length > 0) {
    return {
      success: false,
      conflicts: validation.conflicts.map((c) => ({
        date: formatDateKey(c.date),
        reason: c.conflictDetails || "时段冲突",
      })),
    };
  }

  const additionalAmount =
    Math.round(
      ((extendedSlots.length * Number(block.packagePrice)) / 100) *
        Number(block.discountRate) *
        100,
    ) / 100;

  const result = await prisma.$transaction(async (tx) => {
    await tx.blockBooking.update({
      where: { id: blockBookingId },
      data: {
        endDate: newEnd,
        totalAmount: { increment: additionalAmount },
      },
    });

    const bookingIds: number[] = [];
    for (const slot of extendedSlots) {
      const finalPrice =
        Math.round(
          Number(block.packagePrice) * Number(block.discountRate) * 100,
        ) / 100;
      const b = await tx.booking.create({
        data: {
          customerId: block.customerId,
          venueId: block.venueId,
          bookingDate: slot.date,
          startTime: slot.startTime,
          endTime: slot.endTime,
          type: BookingType.BLOCK,
          status: BookingStatus.CONFIRMED,
          blockBookingId,
          unitPrice: Number(block.packagePrice),
          discountRate: Number(block.discountRate),
          finalPrice,
          paidAmount: 0,
        },
      });
      bookingIds.push(b.id);
    }

    return bookingIds.length;
  });

  return {
    success: true,
    extendedCount: result,
    newEndDate: formatDateKey(newEnd),
    additionalAmount,
  };
}

export async function cancelBlockBooking(
  blockBookingId: number,
  refund: boolean = true,
) {
  const block = await prisma.blockBooking.findUnique({
    where: { id: blockBookingId },
    include: { bookings: true },
  });
  if (!block) throw new Error("包场不存在");

  const activeBookings = block.bookings.filter((b) =>
    ["CONFIRMED", "PAID", "PENDING"].includes(b.status),
  );

  await prisma.$transaction(async (tx) => {
    await tx.blockBooking.update({
      where: { id: blockBookingId },
      data: { status: BookingStatus.CANCELLED },
    });

    await tx.booking.updateMany({
      where: {
        blockBookingId,
        status: { in: ["CONFIRMED", "PAID", "PENDING"] },
      },
      data: { status: BookingStatus.CANCELLED },
    });
  });

  return {
    cancelled: true,
    cancelledBookingsCount: activeBookings.length,
    blockBookingId,
  };
}
