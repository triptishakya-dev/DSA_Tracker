// Integration tests: real route handlers + real Postgres (DATABASE_URL). Uses throwaway users
// ("test-…") that are deleted at the end (cascade removes their rows). Never touches other users.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/server", () => ({ connection: async () => {} }));

import { GET as healthGET } from "@/app/api/health/route";
import { PUT as planPUT } from "@/app/api/v1/plan/route";
import { PATCH as prefsPATCH } from "@/app/api/v1/preferences/route";
import { DELETE as progressDELETE, GET as progressGET } from "@/app/api/v1/progress/route";
import { DELETE as rowDELETE, PUT as rowPUT } from "@/app/api/v1/progress/[problemId]/route";
import { GET as exportGET } from "@/app/api/v1/export/route";
import { POST as importPOST } from "@/app/api/v1/import/route";
import { POST as migratePOST } from "@/app/api/v1/migrate/local/route";
import { db } from "@/lib/server/db";
import { DEFAULT_FILTERS } from "@/lib/types";
import { parseImport } from "@/lib/progress";
import type { ProgressRowDTO, SnapshotDTO } from "@/lib/api-types";

const run = Math.random().toString(36).slice(2, 8);
const A = `test-a-${run}`;
const B = `test-b-${run}`;
const as = (id: string | undefined) => {
  if (id) vi.stubEnv("DEV_USER_ID", id);
  else vi.stubEnv("DEV_USER_ID", "");
};
const today = new Date().toISOString().slice(0, 10);
const P1 = "tuf-401"; // Pattern 1
const P2 = "tuf-412"; // Pattern 2

const req = (method: string, body?: unknown, headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/v1/x", {
    method,
    headers: { "content-type": "application/json", host: "localhost", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const ctx = (problemId: string) => ({ params: Promise.resolve({ problemId }) });
const put = (id: string, body: unknown) => rowPUT(req("PUT", body), ctx(id));
const snapshot = async () => (await (await progressGET(req("GET"))).json()) as SnapshotDTO;

beforeAll(() => {
  expect(process.env.DATABASE_URL, "DATABASE_URL must be set to run API tests").toBeTruthy();
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await db.user.deleteMany({ where: { id: { in: [A, B] } } });
  await db.$disconnect();
});

describe("auth & guards", () => {
  it("401 without a user", async () => {
    as(undefined);
    const r = await progressGET(req("GET"));
    expect(r.status).toBe(401);
    expect((await r.json()).error.code).toBe("UNAUTHENTICATED");
  });

  it("dev auth refuses to run on Vercel/production", async () => {
    as(A);
    vi.stubEnv("VERCEL_ENV", "production");
    expect((await progressGET(req("GET"))).status).toBe(401);
    vi.stubEnv("VERCEL_ENV", "");
  });

  it("blocks cross-origin mutations", async () => {
    as(A);
    const r = await put(P1, { note: "x" }).catch(() => null);
    expect(r?.status).toBe(200);
    const evil = await rowPUT(req("PUT", { note: "y" }, { origin: "https://evil.example" }), ctx(P1));
    expect(evil.status).toBe(403);
    await rowDELETE(req("DELETE"), ctx(P1));
  });

  it("health check pings the database", async () => {
    const r = await healthGET(req("GET"));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
  });
});

describe("PUT /progress/:problemId", () => {
  it("validates bodies and ids", async () => {
    as(A);
    expect((await put(P1, {})).status).toBe(400);
    expect((await put(P1, { completed: true })).status).toBe(400); // localDate required
    expect((await put(P1, { completed: true, localDate: "2026-02-30" })).status).toBe(400);
    expect((await put(P1, { completed: true, localDate: "2020-01-01" })).status).toBe(400); // far from today
    expect((await put(P1, { bogus: 1 })).status).toBe(400); // strict
    expect((await put("tuf-999999", { note: "x" })).status).toBe(404);
    expect((await put("not-an-id", { note: "x" })).status).toBe(404);
  });

  it("completes idempotently: a retry keeps the original completion", async () => {
    as(A);
    const first = (await (await put(P1, { completed: true, localDate: today })).json()) as ProgressRowDTO;
    expect(first.completed).toBe(true);
    expect(first.completedDate).toBe(today);
    const again = (await (await put(P1, { completed: true, localDate: today })).json()) as ProgressRowDTO;
    expect(again.completedAt).toBe(first.completedAt);
    const events = await db.completionEvent.count({ where: { userId: A, problemId: P1, kind: "COMPLETE" } });
    expect(events).toBe(1);
  });

  it("appears in the snapshot in the same shape the frontend uses", async () => {
    as(A);
    await put(P1, { note: "  use two pointers  ", revision: "needs-revision" });
    const s = await snapshot();
    expect(s.version).toBe(1);
    expect(s.startDate).toBe("2026-10-13");
    expect(s.completed[P1].date).toBe(today);
    expect(s.notes[P1]).toBe("use two pointers");
    expect(s.revision[P1]).toBe("needs-revision");
    expect(s.rowUpdatedAt[P1]).toBeTruthy();
  });

  it("un-completing records history, and the row is deleted once every field is default", async () => {
    as(A);
    await put(P1, { completed: false });
    expect((await snapshot()).completed[P1]).toBeUndefined();
    expect(await db.completionEvent.count({ where: { userId: A, problemId: P1, kind: "UNCOMPLETE" } })).toBe(1);
    await put(P1, { note: null, revision: null });
    expect(await db.problemProgress.count({ where: { userId: A, problemId: P1 } })).toBe(0);
  });

  it("returns 409 with the current row when the client copy is stale", async () => {
    as(A);
    const row = (await (await put(P2, { note: "v1" })).json()) as ProgressRowDTO;
    await new Promise((r) => setTimeout(r, 20));
    await put(P2, { note: "v2" });
    const stale = await put(P2, { note: "v3", clientUpdatedAt: row.updatedAt });
    expect(stale.status).toBe(409);
    const body = await stale.json();
    expect(body.error.code).toBe("CONFLICT");
    expect(body.error.current.note).toBe("v2");
    const fresh = await put(P2, { note: "v3", clientUpdatedAt: body.error.current.updatedAt });
    expect(fresh.status).toBe(200);
    await rowDELETE(req("DELETE"), ctx(P2));
  });
});

describe("plan & preferences", () => {
  it("keeps the complete close-time snapshot when an older save arrives afterwards", async () => {
    as(A);
    const sessionId = "af527943-689d-4e60-a4ea-451db92b508a";
    const filters = { ...DEFAULT_FILTERS, status: "pending", sort: "title" };
    await prefsPATCH(req("PATCH", { mutation: { sessionId, sequence: 2 }, filters, ui: { problemPage: 3, problemLayout: "grid" } }));
    await prefsPATCH(req("PATCH", { mutation: { sessionId, sequence: 1 }, filters: DEFAULT_FILTERS, ui: { problemPage: 1, problemLayout: "list" } }));
    expect((await snapshot()).prefs).toMatchObject({ filters, ui: { problemPage: 3, problemLayout: "grid" } });
    // A newly reopened browser has a different session id, so its first save is accepted.
    await prefsPATCH(req("PATCH", { mutation: { sessionId: "895a54da-bbbf-4986-a23d-9b7b0f6eab87", sequence: 1 }, ui: { problemPage: 4 } }));
    expect((await snapshot()).prefs.ui?.problemPage).toBe(4);
    await prefsPATCH(req("PATCH", { filters: DEFAULT_FILTERS, ui: { problemPage: 1, problemLayout: "list" } }));
  });

  it("does not lose independent preference patches arriving concurrently", async () => {
    as(A);
    await Promise.all([
      prefsPATCH(req("PATCH", { ui: { problemPage: 4 } })),
      prefsPATCH(req("PATCH", { filters: { query: "" }, ui: { problemLayout: "grid" } })),
    ]);
    expect((await snapshot()).prefs.ui).toMatchObject({ problemPage: 4, problemLayout: "grid" });
    await prefsPATCH(req("PATCH", { ui: { problemPage: 1, problemLayout: "list" } }));
  });

  it("rejects scroll position preference writes", async () => {
    as(A);
    expect((await prefsPATCH(req("PATCH", { ui: { problemScrollY: 840 } }))).status).toBe(400);
  });

  it("persists pagination with layout, preserves it for UI changes and resets for new filters", async () => {
    as(A);
    await prefsPATCH(req("PATCH", { filters: DEFAULT_FILTERS }));
    expect((await prefsPATCH(req("PATCH", { ui: { problemPage: 4, problemLayout: "grid" } }))).status).toBe(200);
    expect((await snapshot()).prefs.ui).toMatchObject({ problemPage: 4, problemLayout: "grid" });
    await prefsPATCH(req("PATCH", { ui: { problemLayout: "list" } }));
    expect((await snapshot()).prefs.ui?.problemPage).toBe(4);
    await prefsPATCH(req("PATCH", { filters: { sort: "title" } }));
    expect((await snapshot()).prefs.ui).toMatchObject({ problemPage: 1, problemLayout: "list" });
    await prefsPATCH(req("PATCH", { ui: { problemPage: 3 } }));
    await prefsPATCH(req("PATCH", { filters: { sort: "title" } }));
    expect((await snapshot()).prefs.ui?.problemPage).toBe(3);
    const exported = await (await exportGET(req("GET"))).text();
    expect(parseImport(exported)?.prefs.ui?.problemPage).toBe(3);
    for (const problemPage of [0, -1, 1.5, 10001]) {
      expect((await prefsPATCH(req("PATCH", { ui: { problemPage } }))).status).toBe(400);
    }
    await prefsPATCH(req("PATCH", { filters: DEFAULT_FILTERS, ui: { problemPage: 1 } }));
  });

  it("restores problem filters, sorting and layout from database snapshots", async () => {
    as(A);
    const filters = { ...DEFAULT_FILTERS, difficulty: "Medium", topic: "Arrays", status: "pending", query: "sum", sort: "title" };
    expect((await prefsPATCH(req("PATCH", { filters }))).status).toBe(200);
    expect((await prefsPATCH(req("PATCH", { ui: { problemLayout: "grid" } }))).status).toBe(200);
    const saved = await snapshot();
    expect(saved.prefs.filters).toEqual(filters);
    expect(saved.prefs.ui?.problemLayout).toBe("grid");
    expect((await snapshot()).prefs).toEqual(saved.prefs);
    await prefsPATCH(req("PATCH", { filters: { topic: "Graphs" } }));
    expect((await snapshot()).prefs.filters).toEqual({ ...filters, topic: "Graphs" });
    const exported = await (await exportGET(req("GET"))).text();
    expect(parseImport(exported)?.prefs.ui?.problemLayout).toBe("grid");
    expect((await prefsPATCH(req("PATCH", { ui: { problemLayout: "invalid" } }))).status).toBe(400);
    await prefsPATCH(req("PATCH", { filters: DEFAULT_FILTERS, ui: { problemLayout: "list" } }));
  });

  it("saves the activity range and includes it in snapshots and exports", async () => {
    as(A);
    expect((await prefsPATCH(req("PATCH", { ui: { activityRange: "7d" } }))).status).toBe(200);
    expect((await snapshot()).prefs.ui?.activityRange).toBe("7d");
    const exported = await (await exportGET(req("GET"))).json();
    expect(exported.prefs.ui.activityRange).toBe("7d");
    expect((await prefsPATCH(req("PATCH", { ui: { activityRange: "invalid" } }))).status).toBe(400);
    await prefsPATCH(req("PATCH", { ui: { activityRange: "year" } }));
  });

  it("normalizes retired schedule filters from database preferences and API patches", async () => {
    as(A);
    await prefsPATCH(req("PATCH", { filters: { topic: "Graphs" } }));
    await db.userPreferences.update({ where: { userId: A }, data: { filters: { topic: "Graphs", date: "overdue" } } });
    expect((await snapshot()).prefs.filters).toMatchObject({ topic: "Graphs", date: "all" });
    expect((await prefsPATCH(req("PATCH", { filters: { date: "today", topic: "All" } }))).status).toBe(200);
    expect((await snapshot()).prefs.filters).toMatchObject({ date: "all", topic: "All" });
  });

  it("persists theme and sidebar independently from filters", async () => {
    as(A);
    expect((await prefsPATCH(req("PATCH", { ui: { theme: "dark" } }))).status).toBe(200);
    expect((await prefsPATCH(req("PATCH", { ui: { sidebarCollapsed: true } }))).status).toBe(200);
    expect((await snapshot()).prefs.ui).toMatchObject({ theme: "dark", sidebarCollapsed: true });
    expect((await prefsPATCH(req("PATCH", { ui: { theme: "invalid" } }))).status).toBe(400);
  });

  it("saves the start date and rejects invalid dates", async () => {
    as(A);
    expect((await planPUT(req("PUT", { startDate: "2026-11-01" }))).status).toBe(200);
    expect((await snapshot()).startDate).toBe("2026-11-01");
    expect((await planPUT(req("PUT", { startDate: "nope" }))).status).toBe(400);
    await planPUT(req("PUT", { startDate: "2026-10-13" }));
  });

  it("merges filter changes and milestones", async () => {
    as(A);
    await prefsPATCH(req("PATCH", { filters: { difficulty: "Hard" } }));
    await prefsPATCH(req("PATCH", { filters: { topic: "Graphs" }, celebratedMilestones: [25] }));
    const s = await snapshot();
    expect(s.prefs.filters).toMatchObject({ difficulty: "Hard", topic: "Graphs", status: "all" });
    expect(s.prefs.celebratedMilestones).toEqual([25]);
    expect((await prefsPATCH(req("PATCH", { filters: { difficulty: "Impossible" } }))).status).toBe(400);
    expect((await prefsPATCH(req("PATCH", {}))).status).toBe(400);
  });
});

describe("isolation, export/import, reset", () => {
  it("one user can never see another user's data", async () => {
    as(A);
    await put(P1, { completed: true, localDate: today, note: "A's note" });
    as(B);
    const s = await snapshot();
    expect(s.completed).toEqual({});
    expect(s.notes).toEqual({});
  });

  it("export → import(replace) round-trips into another account", async () => {
    as(A);
    const exported = JSON.parse(await (await exportGET(req("GET"))).text());
    expect(exported.app).toBe("dsa-tracker");
    as(B);
    const r = await importPOST(req("POST", { mode: "replace", data: exported }));
    expect(r.status).toBe(200);
    expect((await r.json()).imported).toBeGreaterThan(0);
    const s = await snapshot();
    expect(s.completed[P1].date).toBe(today);
    expect(s.notes[P1]).toBe("A's note");
  });

  it("rejects invalid imports without changing anything", async () => {
    as(B);
    const before = await snapshot();
    expect((await importPOST(req("POST", { mode: "replace", data: { version: 99 } }))).status).toBe(400);
    expect((await importPOST(req("POST", { mode: "replace", data: "garbage" }))).status).toBe(400);
    expect((await snapshot()).completed).toEqual(before.completed);
  });

  it("merge keeps the earliest completion and existing notes, drops unknown problem ids", async () => {
    as(B);
    await put(P2, { completed: true, localDate: today, note: "mine" });
    const file = {
      version: 1,
      startDate: "2026-10-13",
      completed: { [P2]: { date: "2026-10-01", at: 1_000 }, "tuf-999999": { date: today, at: 5 } },
      notes: { [P2]: "theirs" },
      revision: { [P2]: "mastered" },
      prefs: { filters: {}, celebratedMilestones: [] },
    };
    const r = await migratePOST(req("POST", { data: file }));
    expect(r.status).toBe(200);
    expect((await r.json()).skipped).toBe(1);
    const s = await snapshot();
    expect(s.completed[P2].date).toBe("2026-10-01");
    expect(s.notes[P2]).toBe("mine");
    expect(s.revision[P2]).toBe("mastered");
    expect(s.completed[P1].date).toBe(today); // earlier replace-import data is untouched
  });

  it("reset needs the confirm token and clears everything for that user only", async () => {
    as(B);
    expect((await progressDELETE(req("DELETE", {}))).status).toBe(400);
    expect((await progressDELETE(req("DELETE", { confirm: "yes" }))).status).toBe(400);
    expect((await progressDELETE(req("DELETE", { confirm: "RESET" }))).status).toBe(204);
    const s = await snapshot();
    expect(s.completed).toEqual({});
    as(A);
    expect((await snapshot()).completed[P1]).toBeTruthy();
  });
});
