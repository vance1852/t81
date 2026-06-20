import { PrismaClient } from "@prisma/client";

const CustomerType = {
  INDIVIDUAL: "INDIVIDUAL",
  CLUB: "CLUB",
  ENTERPRISE: "ENTERPRISE",
} as const;
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

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 开始生成种子数据...\n");

  console.log("1. 创建场馆...");
  const venues = await Promise.all([
    prisma.venue.create({
      data: {
        name: "1号羽毛球馆",
        type: "羽毛球",
        description: "专业羽毛球场地，木地板",
        capacity: 4,
        basePrice: 80,
      },
    }),
    prisma.venue.create({
      data: {
        name: "2号羽毛球馆",
        type: "羽毛球",
        description: "专业羽毛球场地，PVC地板",
        capacity: 4,
        basePrice: 100,
      },
    }),
    prisma.venue.create({
      data: {
        name: "篮球馆A",
        type: "篮球",
        description: "标准全场篮球场",
        capacity: 20,
        basePrice: 300,
      },
    }),
    prisma.venue.create({
      data: {
        name: "网球场",
        type: "网球",
        description: "室外标准网球场",
        capacity: 4,
        basePrice: 150,
      },
    }),
    prisma.venue.create({
      data: {
        name: "乒乓球室",
        type: "乒乓球",
        description: "室内乒乓球台6张",
        capacity: 12,
        basePrice: 50,
      },
    }),
  ]);
  console.log(`   ✅ 创建了 ${venues.length} 个场馆\n`);

  console.log("2. 为每个场馆创建时段模板（每天9:00-22:00，每小时一个时段）...");
  const timeSlots = [];
  for (let h = 9; h < 22; h++) {
    timeSlots.push({
      startTime: `${h.toString().padStart(2, "0")}:00`,
      endTime: `${(h + 1).toString().padStart(2, "0")}:00`,
    });
  }

  let slotCount = 0;
  for (const venue of venues) {
    for (let day = 0; day < 7; day++) {
      for (const ts of timeSlots) {
        await prisma.venueSlot.create({
          data: {
            venueId: venue.id,
            dayOfWeek: day,
            startTime: ts.startTime,
            endTime: ts.endTime,
            price: Number(venue.basePrice),
          },
        });
        slotCount++;
      }
    }
  }
  console.log(`   ✅ 创建了 ${slotCount} 个时段模板\n`);

  console.log("3. 创建客户（个人、俱乐部、企业）...");
  const customers = await Promise.all([
    prisma.customer.create({
      data: {
        name: "张三",
        type: CustomerType.INDIVIDUAL,
        phone: "13800138001",
        email: "zhangsan@example.com",
      },
    }),
    prisma.customer.create({
      data: {
        name: "李四",
        type: CustomerType.INDIVIDUAL,
        phone: "13800138002",
        email: "lisi@example.com",
      },
    }),
    prisma.customer.create({
      data: {
        name: "王五",
        type: CustomerType.INDIVIDUAL,
        phone: "13800138003",
      },
    }),
    prisma.customer.create({
      data: {
        name: "飞翔羽毛球俱乐部",
        type: CustomerType.CLUB,
        phone: "010-88888801",
        contactInfo: "教练：刘指导，会员50人",
      },
    }),
    prisma.customer.create({
      data: {
        name: "精英篮球俱乐部",
        type: CustomerType.CLUB,
        phone: "010-88888802",
        contactInfo: "青少年培训为主",
      },
    }),
    prisma.customer.create({
      data: {
        name: "华信科技有限公司",
        type: CustomerType.ENTERPRISE,
        phone: "010-66666601",
        email: "hr@huaxin-tech.com",
        contactInfo: "HR部门对接，员工福利",
      },
    }),
    prisma.customer.create({
      data: {
        name: "盛达集团",
        type: CustomerType.ENTERPRISE,
        phone: "010-66666602",
        contactInfo: "行政部，长期包场合作",
      },
    }),
  ]);
  console.log(`   ✅ 创建了 ${customers.length} 个客户\n`);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  console.log("4. 创建散客预订（已有预订数据）...");
  const individualCustomers = customers.filter(
    (c) => c.type === CustomerType.INDIVIDUAL,
  );
  const badmintonVenue1 = venues.find((v) => v.name === "1号羽毛球馆")!;
  const badmintonVenue2 = venues.find((v) => v.name === "2号羽毛球馆")!;
  const basketballVenue = venues.find((v) => v.name === "篮球馆A")!;

  const existingBookings = [];

  for (let i = 0; i < 5; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i + 1);
    const customer = individualCustomers[i % individualCustomers.length];
    const venue = i % 2 === 0 ? badmintonVenue1 : badmintonVenue2;

    existingBookings.push(
      await prisma.booking.create({
        data: {
          customerId: customer.id,
          venueId: venue.id,
          bookingDate: date,
          startTime: "19:00",
          endTime: "20:00",
          type: BookingType.SINGLE,
          status: BookingStatus.CONFIRMED,
          unitPrice: Number(venue.basePrice),
          discountRate: 1,
          finalPrice: Number(venue.basePrice),
          paidAmount: 0,
        },
      }),
    );

    existingBookings.push(
      await prisma.booking.create({
        data: {
          customerId: customer.id,
          venueId: venue.id,
          bookingDate: date,
          startTime: "20:00",
          endTime: "21:00",
          type: BookingType.SINGLE,
          status: BookingStatus.CONFIRMED,
          unitPrice: Number(venue.basePrice),
          discountRate: 1,
          finalPrice: Number(venue.basePrice),
          paidAmount: 0,
        },
      }),
    );
  }

  existingBookings.push(
    await prisma.booking.create({
      data: {
        customerId: individualCustomers[0].id,
        venueId: basketballVenue.id,
        bookingDate: new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000),
        startTime: "18:00",
        endTime: "20:00",
        type: BookingType.SINGLE,
        status: BookingStatus.PAID,
        unitPrice: Number(basketballVenue.basePrice) * 2,
        discountRate: 0.95,
        finalPrice:
          Math.round(Number(basketballVenue.basePrice) * 2 * 0.95 * 100) / 100,
        paidAmount:
          Math.round(Number(basketballVenue.basePrice) * 2 * 0.95 * 100) / 100,
      },
    }),
  );
  console.log(`   ✅ 创建了 ${existingBookings.length} 条散客预订\n`);

  console.log("5. 创建场馆维护期...");
  const maintenances = await Promise.all([
    prisma.venueMaintenance.create({
      data: {
        venueId: badmintonVenue1.id,
        startDate: new Date(today.getTime() + 10 * 24 * 60 * 60 * 1000),
        endDate: new Date(today.getTime() + 10 * 24 * 60 * 60 * 1000),
        reason: "场地保养",
      },
    }),
    prisma.venueMaintenance.create({
      data: {
        venueId: basketballVenue.id,
        startDate: new Date(today.getTime() + 20 * 24 * 60 * 60 * 1000),
        endDate: new Date(today.getTime() + 21 * 24 * 60 * 60 * 1000),
        reason: "地板翻新",
      },
    }),
  ]);
  console.log(`   ✅ 创建了 ${maintenances.length} 个维护期\n`);

  console.log(
    "6. 创建俱乐部周期预订示例（飞翔羽毛球俱乐部 - 每周二、四晚训练）...",
  );
  const badmintonClub = customers.find((c) => c.name === "飞翔羽毛球俱乐部")!;
  const nextTuesday = new Date(today);
  while (nextTuesday.getDay() !== 2)
    nextTuesday.setDate(nextTuesday.getDate() + 1);
  const threeMonthsLater = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000);

  console.log("   (将通过服务创建真实的周期预订...)");

  console.log("\n7. 创建企业包场示例（华信科技 - 每周三晚篮球活动）...");
  const enterprise = customers.find((c) => c.name === "华信科技有限公司")!;
  console.log("   (将通过服务创建真实的包场...)");

  console.log("\n========================================");
  console.log("✅ 种子数据生成完成！");
  console.log("========================================\n");
  console.log("已创建：");
  console.log(`  - 场馆: ${venues.length} 个`);
  console.log(`  - 时段模板: ${slotCount} 个`);
  console.log(`  - 客户: ${customers.length} 个（3个人、2个俱乐部、2个企业）`);
  console.log(`  - 散客预订: ${existingBookings.length} 条`);
  console.log(`  - 维护期: ${maintenances.length} 个\n`);

  console.log("场馆列表：");
  for (const v of venues) {
    console.log(`  #${v.id} ${v.name} (${v.type}) - 单价¥${v.basePrice}/小时`);
  }
  console.log("");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
