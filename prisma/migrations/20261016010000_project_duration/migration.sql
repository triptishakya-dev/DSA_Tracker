ALTER TABLE "WeeklyProject" DROP CONSTRAINT "WeeklyProject_week_dates_check";
ALTER TABLE "WeeklyProject" ADD CONSTRAINT "WeeklyProject_week_dates_check" CHECK (
  EXTRACT(ISODOW FROM "weekStart") = 1 AND
  "startDate" >= "weekStart" AND "startDate" <= "weekStart" + 6 AND
  "endDate" >= "startDate" AND "endDate" <= "startDate" + 7
);
