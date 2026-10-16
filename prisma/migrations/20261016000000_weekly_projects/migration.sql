CREATE TABLE "WeeklyProject" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "weekStart" DATE NOT NULL,
  "name" TEXT NOT NULL,
  "startDate" DATE NOT NULL,
  "endDate" DATE NOT NULL,
  "descriptionPoints" TEXT[] NOT NULL,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WeeklyProject_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WeeklyProject_week_dates_check" CHECK (
    EXTRACT(ISODOW FROM "weekStart") = 1 AND
    "startDate" >= "weekStart" AND "endDate" >= "startDate" AND
    "endDate" <= "weekStart" + 6
  )
);
CREATE UNIQUE INDEX "WeeklyProject_userId_weekStart_key" ON "WeeklyProject"("userId", "weekStart");
ALTER TABLE "WeeklyProject" ADD CONSTRAINT "WeeklyProject_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
