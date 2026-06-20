const express = require("express");
import prisma from "../lib/prisma";

const router = express.Router();

router.get("/", async (req: any, res: any) => {
  try {
    const venues = await prisma.venue.findMany({
      where: { isActive: true },
      include: { _count: { select: { slots: true } } },
    });
    res.json({ success: true, data: venues });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.get("/:id", async (req: any, res: any) => {
  try {
    const venue = await prisma.venue.findUnique({
      where: { id: Number(req.params.id) },
      include: { slots: true, maintenances: true },
    });
    if (!venue) {
      return res.status(404).json({ success: false, error: "场馆不存在" });
    }
    res.json({ success: true, data: venue });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.post("/", async (req: any, res: any) => {
  try {
    const { name, type, description, capacity, basePrice } = req.body;
    const venue = await prisma.venue.create({
      data: {
        name,
        type: type || "通用",
        description,
        capacity: capacity || 1,
        basePrice: basePrice || 100,
      },
    });
    res.json({ success: true, data: venue });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.post("/:id/slots", async (req: any, res: any) => {
  try {
    const venueId = Number(req.params.id);
    const { slots } = req.body;
    const created = await prisma.$transaction(
      slots.map((s: any) =>
        prisma.venueSlot.create({
          data: {
            venueId,
            dayOfWeek: s.dayOfWeek,
            startTime: s.startTime,
            endTime: s.endTime,
            price: s.price,
          },
        }),
      ),
    );
    res.json({ success: true, data: created });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.get("/:id/slots/:date", async (req: any, res: any) => {
  try {
    const { getAvailableSlots } = await import("../services/bookingService");
    const slots = await getAvailableSlots(
      Number(req.params.id),
      req.params.date,
    );
    res.json({ success: true, data: slots });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.post("/maintenance", async (req: any, res: any) => {
  try {
    const { venueId, startDate, endDate, reason } = req.body;
    const maintenance = await prisma.venueMaintenance.create({
      data: {
        venueId,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        reason,
      },
    });
    res.json({ success: true, data: maintenance });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

export default router;
