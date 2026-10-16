import { describe, expect, it } from "vitest";
import { projectDetailsSchema, projectPatchSchema, projectProgress, projectStatus, projectWeek } from "@/lib/projects";

const valid = { name: " Product ", startDate: "2026-10-19", endDate: "2026-10-25", descriptionPoints: [" Build a feature "] };
describe("weekly projects", () => {
  it("normalizes names and points", () => {
    expect(projectDetailsSchema.parse(valid)).toMatchObject({ name: "Product", descriptionPoints: ["Build a feature"] });
  });
  it("anchors Sunday and Monday across year boundaries", () => {
    expect(projectWeek("2027-01-03")).toBe("2026-12-28");
    expect(projectWeek("2027-01-04")).toBe("2027-01-04");
  });
  it("rejects invalid, reversed, and overlong date ranges", () => {
    for (const dates of [{ startDate: "2026-02-30" }, { endDate: "2026-10-18" }, { endDate: "2026-10-27" }]) {
      expect(projectDetailsSchema.safeParse({ ...valid, ...dates }).success).toBe(false);
    }
  });
  it("allows exactly seven days across calendar weeks", () => {
    expect(projectDetailsSchema.safeParse({ ...valid, startDate: "2026-10-23", endDate: "2026-10-30" }).success).toBe(true);
  });
  it("requires nonblank, bounded project details and rejects ownership injection", () => {
    for (const patch of [{ name: " " }, { descriptionPoints: [] }, { descriptionPoints: [" "] }, { userId: "other" }, { name: "x".repeat(151) }]) {
      expect(projectDetailsSchema.safeParse({ ...valid, ...patch }).success).toBe(false);
    }
    expect(projectPatchSchema.safeParse({ completed: true }).success).toBe(true);
    expect(projectPatchSchema.safeParse({ completedAt: "2026-01-01" }).success).toBe(false);
    expect(projectPatchSchema.safeParse({}).success).toBe(false);
  });
  it("calculates progress from checked points", () => {
    expect(projectProgress({ descriptionPoints: ["a", "b", "c"], completedPoints: [true, false, true], completedAt: null })).toEqual({ total: 3, completed: 2, percent: 67 });
    expect(projectProgress({ descriptionPoints: [], completedPoints: [], completedAt: null }).percent).toBe(0);
    expect(projectPatchSchema.safeParse({ pointIndex: -1, pointText: "a", completed: true }).success).toBe(false);
  });
  it("handles older responses without checkbox states", () => {
    expect(projectProgress({ descriptionPoints: ["a", "b"], completedAt: null }).percent).toBe(0);
    expect(projectProgress({ descriptionPoints: ["a", "b"], completedAt: "2026-10-16T00:00:00Z" }).percent).toBe(100);
  });
  it("derives planned, active, overdue and completed statuses", () => {
    const row = { ...valid, id: "1", weekStart: "2026-10-19", completedAt: null, completedPoints: [false] };
    expect(projectStatus(row, "2026-10-18")).toBe("Planned");
    expect(projectStatus(row, "2026-10-19")).toBe("In progress");
    expect(projectStatus(row, "2026-10-25")).toBe("In progress");
    expect(projectStatus(row, "2026-10-26")).toBe("Overdue");
    expect(projectStatus({ ...row, completedAt: "2026-10-20T00:00:00Z" }, "2026-10-26")).toBe("Completed");
  });
});
