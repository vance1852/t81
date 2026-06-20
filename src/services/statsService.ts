import prisma from "../lib/prisma";
import {
  normalizeDate,
  formatDateKey,
  expandRecurringSlots,
  expandBlockSlots,
  eachDayOfInterval,
} from "../utils/date";
const BookingType = {
  SINGLE: "SINGLE",
  RECURRING: "RECURRING",
  BLOCK: "BLOCK",
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
const CustomerType = {
  INDIVIDUAL: "INDIVIDUAL",
  CLUB: "CLUB",
  ENTERPRISE: "ENTERPRISE",
} as const;
type BookingType = (typeof BookingType)[keyof typeof BookingType];
type BookingStatus = (typeof BookingStatus)[keyof typeof BookingStatus];
type CustomerType = (typeof CustomerType)[keyof typeof CustomerType];

export async function getVenueOccupancyStats(
  venueId: number,
  startDate: Date | string,
  endDate: Date | string,
) {
  const sDate = normalizeDate(startDate);
  const eDate = normalizeDate(endDate);

  const [venue, venueSlots, bookings, recurringGroups, blockBookings] =
    await Promise.all([
      prisma.venue.findUnique({ where: { id: venueId } }),
      prisma.venueSlot.findMany({ where: { venueId, isActive: true } }),
      prisma.booking.findMany({
        where: {
          venueId,
          bookingDate: { gte: sDate, lte: eDate },
          status: { in: ["CONFIRMED", "PAID", "COMPLETED"] },
        },
        select: {
          id: true,
          bookingDate: true,
          startTime: true,
          endTime: true,
          type: true,
          finalPrice: true,
          recurringGroupId: true,
          blockBookingId: true,
        },
      }),
      prisma.recurringBookingGroup.findMany({
        where: {
          venueId,
          status: { in: ["CONFIRMED", "PAID"] },
          startDate: { lte: eDate },
          endDate: { gte: sDate },
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
          startDate: { lte: eDate },
          endDate: { gte: sDate },
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
    ]);

  if (!venue) throw new Error("场馆不存在");

  const days = eachDayOfInterval({ start: sDate, end: eDate });
  const totalDays = days.length;

  let totalSlotsAvailable = 0;
  let totalSlotsOccupied = 0;
  let singleSlotsOccupied = 0;
  let recurringSlotsOccupied = 0;
  let blockSlotsOccupied = 0;

  const dailyStats: Array<{
    date: string;
    totalSlots: number;
    occupiedSlots: number;
    occupancyRate: number;
    single: number;
    recurring: number;
    block: number;
  }> = [];

  for (const day of days) {
    const dow = day.getDay();
    const daySlots = venueSlots.filter((s) => s.dayOfWeek === dow);
    const dayTotalSlots = daySlots.length;
    totalSlotsAvailable += dayTotalSlots;

    let dayOccupied = 0;
    let s = 0,
      r = 0,
      b = 0;

    for (const slot of daySlots) {
      const dayBookings = bookings.filter(
        (bk) =>
          formatDateKey(bk.bookingDate) === formatDateKey(day) &&
          bk.startTime <= slot.startTime &&
          bk.endTime >= slot.endTime,
      );
      if (dayBookings.length > 0) {
        dayOccupied++;
        const bk = dayBookings[0];
        if (bk.type === "SINGLE") s++;
        else if (bk.type === "RECURRING") r++;
        else if (bk.type === "BLOCK") b++;
      }
    }

    totalSlotsOccupied += dayOccupied;
    singleSlotsOccupied += s;
    recurringSlotsOccupied += r;
    blockSlotsOccupied += b;

    dailyStats.push({
      date: formatDateKey(day),
      totalSlots: dayTotalSlots,
      occupiedSlots: dayOccupied,
      occupancyRate:
        dayTotalSlots > 0
          ? Math.round((dayOccupied / dayTotalSlots) * 10000) / 100
          : 0,
      single: s,
      recurring: r,
      block: b,
    });
  }

  const totalRevenue = bookings.reduce(
    (sum, b) => sum + Number(b.finalPrice),
    0,
  );

  return {
    venueId,
    venueName: venue.name,
    period: {
      start: formatDateKey(sDate),
      end: formatDateKey(eDate),
      days: totalDays,
    },
    totalSlotsAvailable,
    totalSlotsOccupied,
    occupancyRate:
      totalSlotsAvailable > 0
        ? Math.round((totalSlotsOccupied / totalSlotsAvailable) * 10000) / 100
        : 0,
    breakdownByType: {
      single: singleSlotsOccupied,
      recurring: recurringSlotsOccupied,
      block: blockSlotsOccupied,
    },
    totalRevenue,
    dailyStats,
  };
}

export async function getGroupCustomerStats(
  startDate?: Date | string,
  endDate?: Date | string,
) {
  const whereClause: any = {};
  if (startDate)
    whereClause.createdAt = {
      ...(whereClause.createdAt || {}),
      gte: normalizeDate(startDate),
    };
  if (endDate)
    whereClause.createdAt = {
      ...(whereClause.createdAt || {}),
      lte: normalizeDate(endDate),
    };

  const [customers, recurringGroups, blockBookings] = await Promise.all([
    prisma.customer.findMany({
      where: { type: { in: ["CLUB", "ENTERPRISE"] } },
      include: {
        _count: {
          select: {
            bookings: true,
            recurringGroups: true,
            blockBookings: true,
          },
        },
        recurringGroups: { include: { bookings: true } },
        blockBookings: { include: { bookings: true } },
        bookings: { where: { type: "SINGLE" } },
      },
    }),
    prisma.recurringBookingGroup.findMany({
      where: {
        ...whereClause,
        customer: { type: { in: ["CLUB", "ENTERPRISE"] } },
      },
      include: { customer: true, _count: { select: { bookings: true } } },
    }),
    prisma.blockBooking.findMany({
      where: {
        ...whereClause,
        customer: { type: { in: ["CLUB", "ENTERPRISE"] } },
      },
      include: { customer: true, _count: { select: { bookings: true } } },
    }),
  ]);

  const customerStats = customers.map((c) => {
    const recurringRevenue = c.recurringGroups.reduce(
      (s, g) => s + Number(g.totalAmount),
      0,
    );
    const blockRevenue = c.blockBookings.reduce(
      (s, b) => s + Number(b.totalAmount),
      0,
    );
    const singleRevenue = c.bookings.reduce(
      (s, b) => s + Number(b.finalPrice),
      0,
    );
    const totalBookings =
      c._count.bookings +
      c.recurringGroups.reduce((s, g) => s + g.bookings.length, 0) +
      c.blockBookings.reduce((s, b) => s + b.bookings.length, 0);

    return {
      customerId: c.id,
      name: c.name,
      type: c.type,
      totalRecurringGroups: c._count.recurringGroups,
      totalBlockBookings: c._count.blockBookings,
      totalBookings,
      totalSpent: recurringRevenue + blockRevenue + singleRevenue,
      recurringRevenue,
      blockRevenue,
      singleRevenue,
    };
  });

  return {
    totalGroupCustomers: customers.length,
    totalRecurringGroups: recurringGroups.length,
    totalBlockBookings: blockBookings.length,
    totalRevenue: customerStats.reduce((s, c) => s + c.totalSpent, 0),
    customerStats: customerStats.sort((a, b) => b.totalSpent - a.totalSpent),
    breakdownByType: {
      club: customerStats.filter((c) => c.type === "CLUB").length,
      enterprise: customerStats.filter((c) => c.type === "ENTERPRISE").length,
    },
  };
}

export async function getRevenueStats(
  startDate: Date | string,
  endDate: Date | string,
) {
  const sDate = normalizeDate(startDate);
  const eDate = normalizeDate(endDate);

  const [bookings, recurringGroups, blockBookings, invoices] =
    await Promise.all([
      prisma.booking.findMany({
        where: {
          bookingDate: { gte: sDate, lte: eDate },
          status: { in: ["CONFIRMED", "PAID", "COMPLETED"] },
        },
        select: { type: true, finalPrice: true, paidAmount: true },
      }),
      prisma.recurringBookingGroup.findMany({
        where: { createdAt: { gte: sDate, lte: eDate } },
        select: { totalAmount: true, paidAmount: true, discountRate: true },
      }),
      prisma.blockBooking.findMany({
        where: { createdAt: { gte: sDate, lte: eDate } },
        select: { totalAmount: true, paidAmount: true, discountRate: true },
      }),
      prisma.invoice.findMany({
        where: { issuedAt: { gte: sDate, lte: eDate } },
        select: {
          type: true,
          totalAmount: true,
          paidAmount: true,
          status: true,
        },
      }),
    ]);

  const singleRevenue = bookings
    .filter((b) => b.type === "SINGLE")
    .reduce((s, b) => s + Number(b.finalPrice), 0);
  const singlePaid = bookings
    .filter((b) => b.type === "SINGLE")
    .reduce((s, b) => s + Number(b.paidAmount), 0);

  const recurringRevenue = recurringGroups.reduce(
    (s, g) => s + Number(g.totalAmount),
    0,
  );
  const recurringPaid = recurringGroups.reduce(
    (s, g) => s + Number(g.paidAmount),
    0,
  );

  const blockRevenue = blockBookings.reduce(
    (s, b) => s + Number(b.totalAmount),
    0,
  );
  const blockPaid = blockBookings.reduce((s, b) => s + Number(b.paidAmount), 0);

  const totalExpected = singleRevenue + recurringRevenue + blockRevenue;
  const totalPaid = singlePaid + recurringPaid + blockPaid;

  const totalDiscount =
    recurringGroups.reduce((s, g) => {
      const orig = Number(g.totalAmount) / (Number(g.discountRate) || 1);
      return s + (orig - Number(g.totalAmount));
    }, 0) +
    blockBookings.reduce((s, b) => {
      const orig = Number(b.totalAmount) / (Number(b.discountRate) || 1);
      return s + (orig - Number(b.totalAmount));
    }, 0);

  return {
    period: { start: formatDateKey(sDate), end: formatDateKey(eDate) },
    totalExpectedRevenue: Math.round(totalExpected * 100) / 100,
    totalPaidRevenue: Math.round(totalPaid * 100) / 100,
    totalDiscount: Math.round(totalDiscount * 100) / 100,
    unpaidAmount: Math.round((totalExpected - totalPaid) * 100) / 100,
    byType: {
      single: {
        expected: Math.round(singleRevenue * 100) / 100,
        paid: Math.round(singlePaid * 100) / 100,
      },
      recurring: {
        expected: Math.round(recurringRevenue * 100) / 100,
        paid: Math.round(recurringPaid * 100) / 100,
      },
      block: {
        expected: Math.round(blockRevenue * 100) / 100,
        paid: Math.round(blockPaid * 100) / 100,
      },
    },
    invoiceStats: {
      total: invoices.length,
      paid: invoices.filter((i) => i.status === "PAID").length,
      unpaid: invoices.filter((i) => i.status === "UNPAID").length,
      partial: invoices.filter((i) => i.status === "PARTIAL").length,
      refunded: invoices.filter((i) => i.status === "REFUNDED").length,
    },
  };
}

export async function getDashboardSummary() {
  const today = new Date();
  const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    totalVenues,
    totalCustomers,
    activeRecurring,
    activeBlocks,
    todayBookings,
    weekRevenue,
  ] = await Promise.all([
    prisma.venue.count({ where: { isActive: true } }),
    prisma.customer.count(),
    prisma.recurringBookingGroup.count({
      where: { status: { in: ["CONFIRMED", "PAID"] } },
    }),
    prisma.blockBooking.count({
      where: { status: { in: ["CONFIRMED", "PAID"] } },
    }),
    prisma.booking.count({
      where: {
        bookingDate: { gte: normalizeDate(today), lte: normalizeDate(today) },
        status: { in: ["CONFIRMED", "PAID"] },
      },
    }),
    getRevenueStats(weekAgo, today),
  ]);

  return {
    totalVenues,
    totalCustomers,
    activeRecurringGroups: activeRecurring,
    activeBlockBookings: activeBlocks,
    todayBookings,
    thisWeekRevenue: weekRevenue,
  };
}
