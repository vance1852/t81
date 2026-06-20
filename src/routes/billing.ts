const express = require("express");
import prisma from "../lib/prisma";
import {
  recordPayment,
  calculateRefund,
  processRefund,
} from "../services/billingService";

const router = express.Router();

router.get("/", async (req: any, res: any) => {
  try {
    const { customerId, status, type } = req.query;
    const where: any = {};
    if (customerId) where.customerId = Number(customerId);
    if (status) where.status = status;
    if (type) where.type = type;

    const invoices = await prisma.invoice.findMany({
      where,
      include: { customer: true, _count: { select: { bookings: true } } },
      orderBy: { issuedAt: "desc" },
    });
    res.json({ success: true, data: invoices });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.get("/:id", async (req: any, res: any) => {
  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id: Number(req.params.id) },
      include: { customer: true, bookings: { include: { venue: true } } },
    });
    if (!invoice)
      return res.status(404).json({ success: false, error: "账单不存在" });
    res.json({ success: true, data: invoice });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.post("/:id/pay", async (req: any, res: any) => {
  try {
    const { amount } = req.body;
    if (!amount || amount <= 0) {
      return res
        .status(400)
        .json({ success: false, error: "支付金额必须大于0" });
    }
    const invoice = await recordPayment(Number(req.params.id), Number(amount));
    res.json({ success: true, data: invoice });
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

router.get("/refund-preview/:bookingId", async (req: any, res: any) => {
  try {
    const result = await calculateRefund(
      Number(req.params.bookingId),
      new Date(),
    );
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

router.post("/refund/:bookingId", async (req: any, res: any) => {
  try {
    const result = await processRefund(Number(req.params.bookingId));
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

export default router;
