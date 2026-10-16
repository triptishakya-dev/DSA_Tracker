import { z } from "zod";
import { addDays, isIsoDate } from "@/lib/dates";

export function projectWeek(date: string): string {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return addDays(date, -((day + 6) % 7));
}
const date = z.string().refine(isIsoDate, "Enter a valid date");
export const projectDetailsSchema = z.object({
  name: z.string().trim().min(1, "Enter a project name").max(150),
  startDate: date,
  endDate: date,
  descriptionPoints: z.array(z.string().trim().min(1, "Description points cannot be empty").max(1000)).min(1).max(30),
}).strict().superRefine((value, ctx) => {
  if (!isIsoDate(value.startDate) || !isIsoDate(value.endDate)) return;
  if (value.endDate < value.startDate) ctx.addIssue({ code: "custom", path: ["endDate"], message: "End date must be on or after the start date" });
  if (value.endDate > addDays(value.startDate, 7)) ctx.addIssue({ code: "custom", path: ["endDate"], message: "End date must be within seven days of the start date" });
});
export const projectPatchSchema = z.union([projectDetailsSchema, z.object({ completed: z.boolean() }).strict(), z.object({ pointIndex: z.number().int().min(0).max(29), pointText: z.string().min(1).max(1000), completed: z.boolean() }).strict()]);
export type ProjectDetails = z.infer<typeof projectDetailsSchema>;
export interface WeeklyProjectDTO extends ProjectDetails {
  id: string;
  weekStart: string;
  completedAt: string | null;
  completedPoints?: boolean[];
}
export function projectStatus(project: WeeklyProjectDTO, today: string) {
  if (project.completedAt) return "Completed";
  if (today > project.endDate) return "Overdue";
  return today < project.startDate ? "Planned" : "In progress";
}

export function projectProgress(project: Pick<WeeklyProjectDTO, "descriptionPoints" | "completedPoints" | "completedAt">) {
  const total = project.descriptionPoints.length;
  const completed = project.descriptionPoints.filter((_, index) => project.completedPoints?.[index] ?? !!project.completedAt).length;
  return { total, completed, percent: total ? Math.round(completed / total * 100) : 0 };
}
