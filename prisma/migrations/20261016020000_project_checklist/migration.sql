ALTER TABLE "WeeklyProject" ADD COLUMN "completedPoints" BOOLEAN[] NOT NULL DEFAULT ARRAY[]::BOOLEAN[];
UPDATE "WeeklyProject" SET "completedPoints" = ARRAY(SELECT "completedAt" IS NOT NULL FROM unnest("descriptionPoints"));
