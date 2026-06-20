const express = require("express");
import {
  createSingleBooking,
  getBookingDetails,
  listBookings,
  cancelSingleBooking,
} from "../services/bookingService";
import { validateBulkConflicts } from "../services/conflictService";

const router = express.Router();

router.get("/", async (req: any, res: any) => {
  try {
    const { venueId, customerId, startDate, endDate, type, status } = req.query;
    const bookings = await listBookings({
      venueId: venueId ? Number(venueId) : undefined,
      customerId: customerId ? Number(customerId) : undefined,
      startDate: startDate as string | undefined,
      endDate: endDate as string | undefined,
      type: type as any,
      status: status as any,
    });
    res.json({ success: true, data: bookings });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.get("/:id", async (req: any, res: any) => {
  try {
    const booking = await getBookingDetails(Number(req.params.id));
    res.json({ success: true, data: booking });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.post("/", async (req: any, res: any) => {
  try {
    const result = await createSingleBooking(req.body);
    if (!result.success) {
      return res.status(409).json(result);
    }
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.delete("/:id", async (req: any, res: any) => {
  try {
    const { refund } = req.query;
    const result = await cancelSingleBooking(
      Number(req.params.id),
      refund !== "false",
    );
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

router.post("/validate-conflicts", async (req: any, res: any) => {
  try {
    const { venueId, slots } = req.body;
    const formattedSlots = slots.map((s: any) => ({
      ...s,
      date: new Date(s.date),
    }));
    const result = await validateBulkConflicts({
      venueId,
      slots: formattedSlots,
    });
    res.json({
      success: true,
      data: {
        validCount: result.validSlots.length,
        conflictCount: result.conflicts.length,
        conflicts: result.conflicts,
        validSlots: result.validSlots,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

export default router;
