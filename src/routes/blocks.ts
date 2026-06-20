const express = require("express");
import {
  createBlockBooking,
  getBlockBookingDetails,
  listBlockBookings,
  updateBlockBookingStatus,
  extendBlockBooking,
  cancelBlockBooking,
} from "../services/blockService";

const router = express.Router();

router.get("/", async (req: any, res: any) => {
  try {
    const { venueId, customerId, status } = req.query;
    const blocks = await listBlockBookings({
      venueId: venueId ? Number(venueId) : undefined,
      customerId: customerId ? Number(customerId) : undefined,
      status: status as any,
    });
    res.json({ success: true, data: blocks });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.get("/:id", async (req: any, res: any) => {
  try {
    const block = await getBlockBookingDetails(Number(req.params.id));
    res.json({ success: true, data: block });
  } catch (error) {
    res.status(404).json({ success: false, error: (error as Error).message });
  }
});

router.post("/", async (req: any, res: any) => {
  try {
    const result = await createBlockBooking(req.body);
    if (!result.success) {
      return res.status(409).json(result);
    }
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.patch("/:id/status", async (req: any, res: any) => {
  try {
    const { status } = req.body;
    const result = await updateBlockBookingStatus(
      Number(req.params.id),
      status,
    );
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

router.post("/:id/extend", async (req: any, res: any) => {
  try {
    const { newEndDate } = req.body;
    const result = await extendBlockBooking(Number(req.params.id), newEndDate);
    if (!result.success) {
      return res.status(409).json(result);
    }
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

router.delete("/:id", async (req: any, res: any) => {
  try {
    const { refund } = req.query;
    const result = await cancelBlockBooking(
      Number(req.params.id),
      refund !== "false",
    );
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

export default router;
