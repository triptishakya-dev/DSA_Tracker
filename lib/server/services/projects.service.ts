import "server-only";
import { db } from "../db";
import { ApiError } from "../errors";
import { fromDateOnly, toDateOnly } from "../mappers";
import { projectWeek, type ProjectDetails } from "@/lib/projects";
import type { WeeklyProject } from "@/lib/prisma-client/client";

function dto(row: WeeklyProject) {
  return { id: row.id, name: row.name, weekStart: fromDateOnly(row.weekStart), startDate: fromDateOnly(row.startDate), endDate: fromDateOnly(row.endDate), descriptionPoints: row.descriptionPoints, completedPoints: row.completedPoints, completedAt: row.completedAt?.toISOString() ?? null };
}
function data(value: ProjectDetails) {
  return { ...value, weekStart: toDateOnly(projectWeek(value.startDate)), startDate: toDateOnly(value.startDate), endDate: toDateOnly(value.endDate) };
}
async function write<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation(); }
  catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "P2002") throw new ApiError("CONFLICT", "You already have a project for this week. Edit it or choose another week.");
    if (code === "P2025") throw new ApiError("NOT_FOUND", "Project not found");
    throw error;
  }
}
export async function listProjects(userId: string) {
  return (await db.weeklyProject.findMany({ where: { userId }, orderBy: { weekStart: "desc" } })).map(dto);
}
export async function createProject(userId: string, value: ProjectDetails) {
  return write(async () => dto(await db.weeklyProject.create({ data: { userId, ...data(value), completedPoints: value.descriptionPoints.map(() => false) } })));
}
export async function updateProject(userId: string, id: string, value: ProjectDetails | { completed: boolean } | { pointIndex: number; pointText: string; completed: boolean }) {
  return write(() => db.$transaction(async (tx) => {
    // Serialize checklist and description edits so simultaneous requests cannot lose ticks.
    await tx.$queryRaw`SELECT "id" FROM "WeeklyProject" WHERE "id" = ${id} AND "userId" = ${userId} FOR UPDATE`;
    const current = await tx.weeklyProject.findFirst({ where: { id, userId } });
    if (!current) throw new ApiError("NOT_FOUND", "Project not found");
    let completedPoints: boolean[];
    let details = {};
    if ("pointIndex" in value) {
      if (current.descriptionPoints[value.pointIndex] !== value.pointText) throw new ApiError("CONFLICT", "This point has changed. Refresh projects before trying again.");
      completedPoints = current.descriptionPoints.map((_, index) => index === value.pointIndex ? value.completed : !!current.completedPoints[index]);
    } else if ("completed" in value) {
      completedPoints = current.descriptionPoints.map(() => value.completed);
    } else {
      details = data(value);
      // Match unchanged points once each, preserving checks through removals and reordering.
      const remaining = current.descriptionPoints.map((text, index) => ({ text, completed: !!current.completedPoints[index] }));
      completedPoints = value.descriptionPoints.map((text) => {
        const index = remaining.findIndex((point) => point.text === text);
        return index < 0 ? false : remaining.splice(index, 1)[0].completed;
      });
    }
    const completedAt = completedPoints.length > 0 && completedPoints.every(Boolean) ? current.completedAt ?? new Date() : null;
    return dto(await tx.weeklyProject.update({ where: { id, userId }, data: { ...details, completedPoints, completedAt } }));
  }));
}
export async function deleteProject(userId: string, id: string) {
  await write(() => db.weeklyProject.delete({ where: { id, userId } }));
}
