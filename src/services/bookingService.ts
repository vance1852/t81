import prisma from "../lib/prisma";
import { normalizeDate, formatDateKey } from "../utils/date";
import { validateSingleSlotConflict } from "./conflictService";
import { calculatePrice, createInvoice } from "./billingService";
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

export interface CreateSingleBookingInput {
  customerId: number;
  venueId: number;
  bookingDate: Date | string;
  startTime: string;
  endTime: string;
  unitPrice?: number;
  notes?: string;
  autoCreateInvoice?: boolean;
}

export async function createSingleBooking(input: CreateSingleBookingInput) {
  const {
    customerId,
    venueId,
    bookingDate,
    startTime,
    endTime,
    notes,
    autoCreateInvoice = true,
  } = input;

  const date = normalizeDate(bookingDate);

  const venue = await prisma.venue.findUnique({ where: { id: venueId } });
  if (!venue) throw new Error("场馆不存在");

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
  });
  if (!customer) throw new Error("客户不存在");

  const conflict = await validateSingleSlotConflict(
    venueId,
    date,
    startTime,
    endTime,
  );
  if (conflict) {
    return {
      success: false,
      conflict: {
        date: formatDateKey(date),
        startTime,
        endTime,
        type: conflict.conflictType,
        details: conflict.conflictDetails,
      },
    };
  }

  const unitPrice = input.unitPrice ?? Number(venue.basePrice);
  const pricing = calculatePrice({ unitPrice, quantity: 1 });

  try {
    const result = await prisma.$transaction(async (tx) => {
      const booking = await tx.booking.create({
        data: {
          customerId,
          venueId,
          bookingDate: date,
          startTime,
          endTime,
          type: BookingType.SINGLE,
          status: BookingStatus.CONFIRMED,
          unitPrice,
          discountRate: 1,
          finalPrice: pricing.finalAmount,
          paidAmount: 0,
          notes,
        },
      });

      let invoiceId: number | undefined;
      if (autoCreateInvoice) {
        const invoice = await createInvoice(
          customerId,
          BookingType.SINGLE,
          pricing.finalAmount,
          [booking.id],
          notes,
          tx,
        );
        invoiceId = invoice?.id;
      }

      return { booking, invoiceId, totalAmount: pricing.finalAmount };
    });

    return {
      success: true,
      bookingId: result.booking.id,
      date: formatDateKey(date),
      startTime,
      endTime,
      totalAmount: result.totalAmount,
      invoiceId: result.invoiceId,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "创建失败",
    };
  }
}

export async function getBookingDetails(bookingId: number) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { customer: true, venue: true, invoice: true },
  });
  if (!booking) throw new Error("预订不存在");
  return booking;
}

export async function listBookings(filters?: {
  venueId?: number;
  customerId?: number;
  startDate?: Date | string;
  endDate?: Date | string;
  type?: BookingType;
  status?: BookingStatus;
}) {
  const where: any = {};
  if (filters?.venueId) where.venueId = filters.venueId;
  if (filters?.customerId) where.customerId = filters.customerId;
  if (filters?.type) where.type = filters.type;
  if (filters?.status) where.status = filters.status;
  if (filters?.startDate || filters?.endDate) {
    where.bookingDate = {};
    if (filters.startDate)
      where.bookingDate.gte = normalizeDate(filters.startDate);
    if (filters.endDate) where.bookingDate.lte = normalizeDate(filters.endDate);
  }

  return prisma.booking.findMany({
    where,
    include: { customer: true, venue: true },
    orderBy: [{ bookingDate: "asc" }, { startTime: "asc" }],
  });
}

export async function cancelSingleBooking(
  bookingId: number,
  refund: boolean = true,
) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) throw new Error("预订不存在");
  if (booking.type !== BookingType.SINGLE) {
    throw new Error("只能取消散客预订，周期/包场预订请使用对应的取消接口");
  }

  await prisma.booking.update({
    where: { id: bookingId },
    data: { status: BookingStatus.CANCELLED },
  });

  if (refund && Number(booking.paidAmount) > 0) {
    const { processRefund } = await import("./billingService");
    await processRefund(bookingId);
  }

  return { success: true, bookingId };
}

export async function getAvailableSlots(
  venueId: number,
  date: Date | string,
): Promise<
  Array<{
    startTime: string;
    endTime: string;
    available: boolean;
    blockedBy?: string;
  }>
> {
  const { getBlockedSlotsForVenue } = await import("./conflictService");

  const d = normalizeDate(date);
  const venueSlots = await prisma.venueSlot.findMany({
    where: { venueId, dayOfWeek: d.getDay(), isActive: true },
    orderBy: { startTime: "asc" },
  });

  const blocked = await getBlockedSlotsForVenue(venueId, d, d);

  const result = venueSlots.map((slot) => {
    const blocker = blocked.find(
      (b) => b.startTime <= slot.startTime && b.endTime >= slot.endTime,
    );
    return {
      startTime: slot.startTime,
      endTime: slot.endTime,
      available: !blocker,
      blockedBy: blocker ? `${blocker.source}: ${blocker.name}` : undefined,
      price: Number(slot.price),
    };
  });

  return result;
}
