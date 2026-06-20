const express = require("express");
import prisma from "../lib/prisma";

const router = express.Router();

router.get("/", async (req: any, res: any) => {
  try {
    const { type } = req.query;
    const where: any = {};
    if (type) where.type = type;

    const customers = await prisma.customer.findMany({
      where,
      include: {
        _count: {
          select: {
            bookings: true,
            recurringGroups: true,
            blockBookings: true,
          },
        },
      },
    });
    res.json({ success: true, data: customers });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.get("/:id", async (req: any, res: any) => {
  try {
    const customer = await prisma.customer.findUnique({
      where: { id: Number(req.params.id) },
      include: {
        bookings: { take: 10, orderBy: { createdAt: "desc" } },
        recurringGroups: { take: 5, orderBy: { createdAt: "desc" } },
        blockBookings: { take: 5, orderBy: { createdAt: "desc" } },
      },
    });
    if (!customer)
      return res.status(404).json({ success: false, error: "客户不存在" });
    res.json({ success: true, data: customer });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.post("/", async (req: any, res: any) => {
  try {
    const { name, type, phone, email, contactInfo } = req.body;
    const customer = await prisma.customer.create({
      data: {
        name,
        type: type || "INDIVIDUAL",
        phone,
        email,
        contactInfo,
      },
    });
    res.json({ success: true, data: customer });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.put("/:id", async (req: any, res: any) => {
  try {
    const customer = await prisma.customer.update({
      where: { id: Number(req.params.id) },
      data: req.body,
    });
    res.json({ success: true, data: customer });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

export default router;
