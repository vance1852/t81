-- CreateTable
CREATE TABLE "Customer" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'INDIVIDUAL',
    "phone" TEXT,
    "email" TEXT,
    "contactInfo" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Venue" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT,
    "capacity" INTEGER NOT NULL DEFAULT 1,
    "basePrice" REAL NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "VenueSlot" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "venueId" INTEGER NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "price" REAL NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "VenueSlot_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VenueMaintenance" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "venueId" INTEGER NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "reason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VenueMaintenance_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RecurringBookingGroup" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "customerId" INTEGER NOT NULL,
    "venueId" INTEGER NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "strategy" TEXT NOT NULL DEFAULT 'SKIP_CONFLICT',
    "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
    "unitPrice" REAL NOT NULL,
    "discountRate" REAL NOT NULL DEFAULT 1.0000,
    "totalAmount" REAL NOT NULL,
    "paidAmount" REAL NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RecurringBookingGroup_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RecurringBookingGroup_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RecurringException" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "groupId" INTEGER NOT NULL,
    "originalDate" DATETIME NOT NULL,
    "action" TEXT NOT NULL,
    "newDate" DATETIME,
    "newStartTime" TEXT,
    "newEndTime" TEXT,
    "reason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "relatedBookingId" INTEGER,
    CONSTRAINT "RecurringException_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "RecurringBookingGroup" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RecurringException_relatedBookingId_fkey" FOREIGN KEY ("relatedBookingId") REFERENCES "Booking" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BlockBooking" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "customerId" INTEGER NOT NULL,
    "venueId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
    "packagePrice" REAL NOT NULL,
    "discountRate" REAL NOT NULL DEFAULT 0.8500,
    "totalAmount" REAL NOT NULL,
    "paidAmount" REAL NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BlockBooking_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BlockBooking_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "customerId" INTEGER NOT NULL,
    "venueId" INTEGER NOT NULL,
    "bookingDate" DATETIME NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'SINGLE',
    "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
    "recurringGroupId" INTEGER,
    "blockBookingId" INTEGER,
    "unitPrice" REAL NOT NULL,
    "discountRate" REAL NOT NULL DEFAULT 1.0000,
    "finalPrice" REAL NOT NULL,
    "paidAmount" REAL NOT NULL DEFAULT 0,
    "invoiceId" INTEGER,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Booking_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Booking_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Booking_recurringGroupId_fkey" FOREIGN KEY ("recurringGroupId") REFERENCES "RecurringBookingGroup" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Booking_blockBookingId_fkey" FOREIGN KEY ("blockBookingId") REFERENCES "BlockBooking" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Booking_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "customerId" INTEGER NOT NULL,
    "invoiceNo" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "totalAmount" REAL NOT NULL,
    "paidAmount" REAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'UNPAID',
    "issuedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" DATETIME,
    "notes" TEXT,
    CONSTRAINT "Invoice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "VenueSlot_venueId_dayOfWeek_startTime_endTime_key" ON "VenueSlot"("venueId", "dayOfWeek", "startTime", "endTime");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_venueId_bookingDate_startTime_endTime_key" ON "Booking"("venueId", "bookingDate", "startTime", "endTime");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_invoiceNo_key" ON "Invoice"("invoiceNo");
