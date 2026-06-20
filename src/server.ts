const express = require("express");
import venueRoutes from "./routes/venues";
import customerRoutes from "./routes/customers";
import bookingRoutes from "./routes/bookings";
import recurringRoutes from "./routes/recurring";
import blockRoutes from "./routes/blocks";
import billingRoutes from "./routes/billing";
import statsRoutes from "./routes/stats";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.use((req: any, res: any, next: any) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

app.get("/", (req: any, res: any) => {
  res.json({
    success: true,
    message: "体育场馆预订系统 API",
    version: "1.0.0",
    endpoints: {
      venues: "/api/venues",
      customers: "/api/customers",
      bookings: "/api/bookings",
      recurring: "/api/recurring",
      blocks: "/api/blocks",
      billing: "/api/billing",
      stats: "/api/stats",
    },
  });
});

app.use("/api/venues", venueRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/recurring", recurringRoutes);
app.use("/api/blocks", blockRoutes);
app.use("/api/billing", billingRoutes);
app.use("/api/stats", statsRoutes);

app.use((err: any, req: any, res: any, next: any) => {
  console.error(err.stack);
  res.status(500).json({ success: false, error: "服务器内部错误" });
});

app.listen(PORT, () => {
  console.log(`\n========================================`);
  console.log(`  体育场馆预订系统已启动`);
  console.log(`  端口: ${PORT}`);
  console.log(`  地址: http://localhost:${PORT}`);
  console.log(`========================================\n`);
  console.log(`可用API端点:`);
  console.log(`  GET    /api/venues              - 场馆列表`);
  console.log(`  GET    /api/venues/:id          - 场馆详情（含时段）`);
  console.log(`  GET    /api/venues/:id/slots/:date - 查询某天可用时段`);
  console.log(`  POST   /api/bookings            - 创建散客预订`);
  console.log(`  POST   /api/bookings/validate-conflicts - 批量冲突校验`);
  console.log(`  POST   /api/recurring           - 创建周期预订`);
  console.log(`  POST   /api/recurring/:id/pause - 暂停周期内若干次`);
  console.log(`  POST   /api/recurring/:id/postpone - 顺延周期预订`);
  console.log(`  POST   /api/recurring/:id/end-early - 提前结束`);
  console.log(`  POST   /api/recurring/:id/exceptions - 单次例外`);
  console.log(`  DELETE /api/recurring/:id       - 取消周期组`);
  console.log(`  POST   /api/blocks              - 创建包场`);
  console.log(`  POST   /api/blocks/:id/extend   - 延长包场`);
  console.log(`  GET    /api/stats/dashboard     - 仪表盘汇总`);
  console.log(`  GET    /api/stats/venue/:id/occupancy - 场馆占用率`);
  console.log(`  GET    /api/stats/customers/group - 团体客户统计`);
  console.log(`  GET    /api/stats/revenue       - 营收统计`);
  console.log(`\n`);
});

export default app;
