import { z } from "zod";
import { isIsoDate } from "@/lib/dates";

export const problemIdSchema = z.string().regex(/^tuf-\d+$/, "Invalid problem id");

export const isoDateSchema = z.string().refine(isIsoDate, "Must be a real YYYY-MM-DD date");

const revisionSchema = z.enum(["needs-revision", "mastered"]);

export const putProgressSchema = z
  .object({
    completed: z.boolean().optional(),
    localDate: isoDateSchema.optional(),
    note: z.string().max(5000).nullable().optional(),
    revision: revisionSchema.nullable().optional(),
    clientUpdatedAt: z.iso.datetime().optional(),
  })
  .strict()
  .refine((b) => b.completed !== undefined || b.note !== undefined || b.revision !== undefined, {
    message: "Provide at least one of completed, note or revision",
  })
  .refine((b) => b.completed !== true || b.localDate !== undefined, {
    message: "localDate is required when completing a problem",
    path: ["localDate"],
  });

export const putPlanSchema = z.object({ startDate: isoDateSchema }).strict();

const filtersPatch = z
  .object({
    difficulty: z.enum(["All", "Easy", "Medium", "Hard"]),
    topic: z.string().min(1).max(100),
    status: z.enum(["all", "completed", "pending"]),
    date: z.enum(["all", "today", "upcoming", "completed-days", "overdue"]).transform(() => "all" as const),
    query: z.string().max(200),
    sort: z.enum(["schedule", "title", "difficulty", "topic", "status"]),
  })
  .partial()
  .strict();

export const patchPreferencesSchema = z
  .object({
    mutation: z.object({ sessionId: z.uuid(), sequence: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER) }).strict().optional(),
    ui: z.object({ problemPage: z.number().int().min(1).max(10_000).optional(), problemLayout: z.enum(["grid", "list"]).optional(), theme: z.enum(["system", "light", "dark"]).optional(), sidebarCollapsed: z.boolean().optional(), activityRange: z.enum(["year", "30d", "7d"]).optional() }).strict().optional(),
    filters: filtersPatch.optional(),
    celebratedMilestones: z.array(z.number().int().min(1).max(10_000)).max(50).optional(),
  })
  .strict()
  .refine((b) => b.ui !== undefined || b.filters !== undefined || b.celebratedMilestones !== undefined, { message: "Nothing to update" });

export const importSchema = z.object({ mode: z.enum(["replace", "merge"]), data: z.unknown() }).strict();
export const migrateSchema = z.object({ data: z.unknown() }).strict();
export const resetSchema = z.object({ confirm: z.literal("RESET") }).strict();

export const IMPORT_MAX_BYTES = 5 * 1024 * 1024;
