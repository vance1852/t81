import prisma from "../lib/prisma";
import { generateInvoiceNo, formatDateKey } from "../utils/date";
const BookingType = {
  SINGLE: "SINGLE",
  RECURRING: "RECURRING",
  BLOCK: "BLOCK",
} as const;
type BookingType = (typeof BookingType)[keyof typeof BookingType];

export interface PricingConfig {
  unitPrice: number;
  quantity: number;
  discountRate?: number;
  packagePrice?: number;
}

export function calculatePrice(config: PricingConfig): {
  unitPrice: number;
  discountRate: number;
  subtotal: number;
  finalAmount: number;
  discountAmount: number;
} {
  const { unitPrice, quantity, discountRate = 1, packagePrice } = config;

  if (packagePrice !== undefined && packagePrice > 0) {
    return {
      unitPrice,
      discountRate: packagePrice / (unitPrice * quantity || 1),
      subtotal: unitPrice * quantity,
      finalAmount: packagePrice,
      discountAmount: unitPrice * quantity - packagePrice,
    };
  }

  const subtotal = unitPrice * quantity;
  const finalAmount = Math.round(subtotal * discountRate * 100) / 100;
  return {
    unitPrice,
    discountRate,
    subtotal,
    finalAmount,
    discountAmount: subtotal - finalAmount,
  };
}

export function calculateRecurringDiscount(
  totalBookings: number,
  customerType: string,
): number {
  let rate = 1;
  if (totalBookings >= 52) rate *= 0.8;
  else if (totalBookings >= 26) rate *= 0.88;
  else if (totalBookings >= 12) rate *= 0.93;
  else if (totalBookings >= 4) rate *= 0.97;

  if (customerType === "ENTERPRISE") rate *= 0.92;
  else if (customerType === "CLUB") rate *= 0.95;

  return Math.round(rate * 10000) / 10000;
}

export function calculateBlockDiscount(totalDays: number): number {
  let rate = 0.85;
  if (totalDays >= 365) rate = 0.7;
  else if (totalDays >= 180) rate = 0.75;
  else if (totalDays >= 90) rate = 0.78;
  else if (totalDays >= 30) rate = 0.82;
  return Math.round(rate * 10000) / 10000;
}

export async function createInvoice(
  customerId: number,
  type: BookingType,
  totalAmount: number,
  bookingIds: number[],
  notes?: string,
  tx?: any,
) {
  const invoiceNo = generateInvoiceNo(
    type === "RECURRING" ? "REC" : type === "BLOCK" ? "BLK" : "INV",
  );

  const client = tx || prisma;

  const invoice = await client.invoice.create({
    data: {
      customerId,
      invoiceNo,
      type,
      totalAmount,
      status: "UNPAID",
      notes,
    },
  });

  if (bookingIds.length > 0) {
    await client.booking.updateMany({
      where: { id: { in: bookingIds } },
      data: { invoiceId: invoice.id },
    });
  }

  return client.invoice.findUnique({
    where: { id: invoice.id },
    include: { bookings: true },
  });
}

export async function recordPayment(invoiceId: number, amount: number) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { bookings: true },
  });

  if (!invoice) throw new Error("Invoice not found");

  const newPaidAmount = Number(invoice.paidAmount) + amount;
  const status =
    newPaidAmount >= Number(invoice.totalAmount)
      ? "PAID"
      : newPaidAmount > 0
        ? "PARTIAL"
        : invoice.status;

  const updated = await prisma.$transaction(async (tx) => {
    const inv = await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        paidAmount: newPaidAmount,
        status,
        paidAt: status === "PAID" ? new Date() : invoice.paidAt,
      },
    });

    if (status === "PAID") {
      await tx.booking.updateMany({
        where: { invoiceId },
        data: { paidAmount: { increment: amount }, status: "PAID" },
      });
    } else {
      const perBooking = amount / (invoice.bookings.length || 1);
      for (const b of invoice.bookings) {
        await tx.booking.update({
          where: { id: b.id },
          data: { paidAmount: { increment: perBooking } },
        });
      }
    }

    return inv;
  });

  return updated;
}

export async function calculateRefund(
  bookingId: number,
  cancelDate: Date,
): Promise<{ refundable: number; booking: any }> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
  });

  if (!booking) throw new Error("Booking not found");

  const paid = Number(booking.paidAmount);
  if (paid <= 0) return { refundable: 0, booking };

  const bookingDate = new Date(booking.bookingDate);
  const diffMs = bookingDate.getTime() - cancelDate.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  let refundRate = 0;
  if (diffDays >= 7) refundRate = 1;
  else if (diffDays >= 3) refundRate = 0.8;
  else if (diffDays >= 1) refundRate = 0.5;
  else refundRate = 0;

  const refundable = Math.round(paid * refundRate * 100) / 100;

  return { refundable, booking };
}

export async function processRefund(bookingId: number) {
  const { refundable, booking } = await calculateRefund(bookingId, new Date());

  if (refundable <= 0) {
    await prisma.booking.update({
      where: { id: bookingId },
      data: { status: "CANCELLED" },
    });
    return { refundable: 0, status: "NO_REFUND" };
  }

  await prisma.$transaction(async (tx) => {
    await tx.booking.update({
      where: { id: bookingId },
      data: {
        status: "CANCELLED",
        paidAmount: { decrement: refundable },
      },
    });

    if (booking.invoiceId) {
      await tx.invoice.update({
        where: { id: booking.invoiceId },
        data: {
          paidAmount: { decrement: refundable },
          status: "REFUNDED",
        },
      });
    }
  });

  return { refundable, status: "REFUNDED" };
}
