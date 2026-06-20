const express = require("express");
import {
  getVenueOccupancyStats,
  getGroupCustomerStats,
  getRevenueStats,
  getDashboardSummary,
} from "../services/statsService";

const router = express.Router();

router.get("/dashboard", async (req: any, res: any) => {
  try {
    const summary = await getDashboardSummary();
    res.json({ success: true, data: summary });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.get("/venue/:venueId/occupancy", async (req: any, res: any) => {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
      return res
        .status(400)
        .json({ success: false, error: "必须提供 startDate 和 endDate" });
    }
    const stats = await getVenueOccupancyStats(
      Number(req.params.venueId),
      startDate as string,
      endDate as string,
    );
    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.get("/customers/group", async (req: any, res: any) => {
  try {
    const { startDate, endDate } = req.query;
    const stats = await getGroupCustomerStats(
      startDate as string | undefined,
      endDate as string | undefined,
    );
    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.get("/revenue", async (req: any, res: any) => {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
      return res
        .status(400)
        .json({ success: false, error: "必须提供 startDate 和 endDate" });
    }
    const stats = await getRevenueStats(startDate as string, endDate as string);
    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

export default router;
