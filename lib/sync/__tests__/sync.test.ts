import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultProgress } from "../../progress";
import type { Progress } from "../../types";
import { ApiClientError } from "../api-client";
import { applyOp, diffProgress, mergeOps, type SyncOp } from "../diff";
import { SyncQueue } from "../queue";

const base = (): Progress => defaultProgress();
const withDone = (p: Progress, id: string, date = "2026-10-13"): Progress => ({ ...p, completed: { ...p.completed, [id]: { date, at: 1 } } });

describe("diffProgress", () => {
  it("emits nothing when nothing changed", () => {
    expect(diffProgress(base(), base())).toEqual([]);
  });

  it("emits completion with the local date, and un-completion", () => {
    const done = withDone(base(), "tuf-1", "2026-10-14");
    expect(diffProgress(base(), done)).toEqual([{ kind: "row", problemId: "tuf-1", body: { completed: true, localDate: "2026-10-14" } }]);
    expect(diffProgress(done, base())).toEqual([{ kind: "row", problemId: "tuf-1", body: { completed: false } }]);
  });

  it("emits notes and revision changes, including clearing", () => {
    const a = { ...base(), notes: { "tuf-1": "hi" }, revision: { "tuf-1": "mastered" as const } };
    expect(diffProgress(base(), a)).toEqual([{ kind: "row", problemId: "tuf-1", body: { note: "hi", revision: "mastered" } }]);
    expect(diffProgress(a, base())).toEqual([{ kind: "row", problemId: "tuf-1", body: { note: null, revision: null } }]);
  });

  it("emits plan and preference changes with only the changed filter keys", () => {
    const next: Progress = { ...base(), startDate: "2026-11-01", prefs: { ...base().prefs, filters: { ...base().prefs.filters, difficulty: "Hard" }, celebratedMilestones: [25] } };
    expect(diffProgress(base(), next)).toEqual([
      { kind: "plan", startDate: "2026-11-01" },
      { kind: "prefs", filters: { difficulty: "Hard" }, celebratedMilestones: [25] },
    ]);
  });

  it("applyOp replays diff output: apply(diff(a, b), a) reproduces b's synced fields", () => {
    const a = withDone(base(), "tuf-2");
    const b: Progress = {
      ...withDone(a, "tuf-1"),
      notes: { "tuf-1": "n" },
      revision: { "tuf-2": "needs-revision" },
      startDate: "2026-12-01",
      prefs: { ...a.prefs, filters: { ...a.prefs.filters, topic: "Graphs" } },
    };
    const replayed = diffProgress(a, b).reduce((acc, op) => applyOp(acc, op), a);
    expect(Object.keys(replayed.completed).sort()).toEqual(Object.keys(b.completed).sort());
    expect(replayed.notes).toEqual(b.notes);
    expect(replayed.revision).toEqual(b.revision);
    expect(replayed.startDate).toBe(b.startDate);
    expect(replayed.prefs.filters).toEqual(b.prefs.filters);
  });

  it("mergeOps lets later fields win", () => {
    const a: SyncOp = { kind: "row", problemId: "x", body: { note: "a", revision: "mastered" } };
    const b: SyncOp = { kind: "row", problemId: "x", body: { note: "b" } };
    expect(mergeOps(a, b)).toEqual({ kind: "row", problemId: "x", body: { note: "b", revision: "mastered" } });
  });
});

describe("SyncQueue", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const row = (id: string, body: object): SyncOp => ({ kind: "row", problemId: id, body });


  it("starts pending preference writes synchronously when flushing on page hide", () => {
    const send = vi.fn(async () => {});
    const queue = new SyncQueue({ send });
    queue.enqueue({ kind: "prefs", ui: { problemPage: 4 } });
    expect(send).not.toHaveBeenCalled();
    queue.flushNow();
    expect(send).toHaveBeenCalledWith({ kind: "prefs", ui: { problemPage: 4 } });
    queue.destroy();
  });
  it("sends ticks immediately and in order", async () => {
    const sent: string[] = [];
    const q = new SyncQueue({ send: async (op) => void sent.push(op.kind === "row" ? op.problemId : op.kind) });
    q.enqueue(row("a", { completed: true, localDate: "2026-10-13" }));
    q.enqueue(row("b", { completed: true, localDate: "2026-10-13" }));
    await vi.advanceTimersByTimeAsync(0);
    expect(sent).toEqual(["a", "b"]);
  });

  it("debounces and coalesces note edits into one request", async () => {
    const send = vi.fn(async () => {});
    const q = new SyncQueue({ send });
    q.enqueue(row("a", { note: "h" }));
    await vi.advanceTimersByTimeAsync(300);
    q.enqueue(row("a", { note: "hi" }));
    await vi.advanceTimersByTimeAsync(300);
    expect(send).not.toHaveBeenCalled(); // still inside the (reset) 500 ms window
    await vi.advanceTimersByTimeAsync(300);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(row("a", { note: "hi" }));
  });

  it("retries network failures with backoff, then succeeds, reporting offline in between", async () => {
    let calls = 0;
    const states: string[] = [];
    const q = new SyncQueue({
      send: async () => {
        if (++calls < 3) throw new ApiClientError("NETWORK", 0, "down");
      },
      onStatus: (s) => states.push(s.state),
      retryDelaysMs: [1000, 2000],
    });
    q.enqueue(row("a", { completed: true, localDate: "2026-10-13" }));
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toBe(1);
    expect(states).toContain("offline");
    expect(q.pendingOps()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(calls).toBe(2);
    await vi.advanceTimersByTimeAsync(2000);
    expect(calls).toBe(3);
    expect(q.pendingOps()).toHaveLength(0);
    expect(states.at(-1)).toBe("idle");
  });

  it("flushNow skips the backoff (e.g. when the browser comes back online)", async () => {
    let calls = 0;
    const q = new SyncQueue({ send: async () => { if (++calls === 1) throw new ApiClientError("NETWORK", 0, "down"); }, retryDelaysMs: [60_000] });
    q.enqueue(row("a", { completed: true, localDate: "2026-10-13" }));
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toBe(1);
    q.flushNow();
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toBe(2);
  });

  it("drops and reports 4xx rejections and 409 conflicts without retrying", async () => {
    const rejected: string[] = [];
    const conflicts: string[] = [];
    const q = new SyncQueue({
      send: async (op) => {
        if (op.kind === "row" && op.problemId === "bad") throw new ApiClientError("VALIDATION", 400, "nope");
        if (op.kind === "row" && op.problemId === "stale") throw new ApiClientError("CONFLICT", 409, "newer", undefined);
      },
      onRejected: (op) => { rejected.push((op as { problemId: string }).problemId); },
      onConflict: (op) => { conflicts.push((op as { problemId: string }).problemId); },
    });
    q.enqueue(row("bad", { note: "x" }));
    q.enqueue(row("stale", { completed: true, localDate: "2026-10-13" }));
    await vi.advanceTimersByTimeAsync(1000);
    expect(rejected).toEqual(["bad"]);
    expect(conflicts).toEqual(["stale"]);
    expect(q.pendingOps()).toHaveLength(0);
  });

  it("keeps failed edits in memory but starts a new session empty", async () => {
    const failing = new SyncQueue({ send: async () => { throw new ApiClientError("NETWORK", 0, "down"); } });
    failing.enqueue(row("a", { completed: true, localDate: "2026-10-13" }));
    await vi.advanceTimersByTimeAsync(0);
    expect(failing.pendingOps()).toHaveLength(1);
    failing.destroy();
    const fresh = new SyncQueue({ send: async () => {} });
    expect(fresh.pendingOps()).toHaveLength(0);
    fresh.destroy();
  });
});
