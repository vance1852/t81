const express = require("express");
import {
  createRecurringBooking,
  getRecurringGroupDetails,
  listRecurringGroups,
  pauseRecurringBookings,
  postponeRecurringBookings,
  cancelRecurringGroup,
  endRecurringGroupEarly,
  createSingleException,
} from "../services/recurringService";

const router = express.Router();

router.get("/", async (req: any, res: any) => {
  try {
    const { venueId, customerId, status } = req.query;
    const groups = await listRecurringGroups({
      venueId: venueId ? Number(venueId) : undefined,
      customerId: customerId ? Number(customerId) : undefined,
      status: status as any,
    });
    res.json({ success: true, data: groups });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.get("/:id", async (req: any, res: any) => {
  try {
    const group = await getRecurringGroupDetails(Number(req.params.id));
    res.json({ success: true, data: group });
  } catch (error) {
    res.status(404).json({ success: false, error: (error as Error).message });
  }
});

router.post("/", async (req: any, res: any) => {
  try {
    const result = await createRecurringBooking(req.body);
    if (!result.success && result.rolledBack) {
      return res.status(409).json(result);
    }
    if (!result.success && !result.rolledBack) {
      return res.status(400).json(result);
    }
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.post("/:id/pause", async (req: any, res: any) => {
  try {
    const { pauseStartDate, pauseEndDate } = req.body;
    const result = await pauseRecurringBookings(
      Number(req.params.id),
      pauseStartDate,
      pauseEndDate,
    );
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

router.post("/:id/postpone", async (req: any, res: any) => {
  try {
    const { fromDate, daysToPostpone, reason } = req.body;
    const result = await postponeRecurringBookings(
      Number(req.params.id),
      fromDate,
      Number(daysToPostpone),
      reason,
    );
    if (!result.success) {
      return res.status(409).json(result);
    }
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

router.post("/:id/end-early", async (req: any, res: any) => {
  try {
    const { endDate } = req.body;
    const result = await endRecurringGroupEarly(Number(req.params.id), endDate);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

router.post("/:id/exceptions", async (req: any, res: any) => {
  try {
    const { originalDate, action, newDate, newStartTime, newEndTime, reason } =
      req.body;
    const result = await createSingleException(
      Number(req.params.id),
      originalDate,
      action,
      { newDate, newStartTime, newEndTime, reason },
    );
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

router.delete("/:id", async (req: any, res: any) => {
  try {
    const { refund } = req.query;
    const result = await cancelRecurringGroup(
      Number(req.params.id),
      refund !== "false",
    );
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

export default router;
