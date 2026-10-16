import type { AchievementDTO } from "@/lib/achievements";
import type { SnapshotDTO } from "@/lib/api-types";
import { PROBLEM_IDS } from "@/lib/problems";
import { validateProgress } from "@/lib/progress";
import type { Progress } from "@/lib/types";
import { api, ApiClientError } from "./api-client";
import { applyOp, diffProgress, mergeOps, opKey, type SyncOp } from "./diff";
import { SyncQueue, type SyncStatus } from "./queue";

export type SyncMode = "unknown" | "synced" | "unauthenticated";
interface Events {
  onAchievements?: (earned: AchievementDTO[], newly: AchievementDTO[]) => void;
  apply: (p: Progress) => void;
  onMode: (mode: SyncMode) => void;
  onStatus: (s: SyncStatus) => void;
  notify: (kind: "error" | "info", message: string) => void;
}

/** API mutations with in-memory ordering, debounce and retries. No browser persistence. */
export class SyncController {
  mode: SyncMode = "unknown";
  private stamps: Record<string, string> = {};
  private queue: SyncQueue;
  private destroyed = false;
  private exclusive = false;
  private failed = false;
  private rejected = new Map<string, SyncOp>();
  private exitSnapshotKey = "";
  private status: SyncStatus = { state: "idle", pending: 0 };

  constructor(private ev: Events) {
    this.queue = new SyncQueue({
      send: (op) => this.send(op),
      onStatus: (s) => { this.status = s; if (!this.destroyed) ev.onStatus({ ...s, state: this.failed && s.pending === 0 ? "error" : s.state }); },
      onRejected: async (op, err) => {
        this.failed = true;
        if (err.status === 401) {
          this.mode = "unauthenticated";
          ev.onMode(this.mode);
          this.queue.clear();
        }
        ev.notify("error", err.status === 401 ? "Your session expired. Unlock your tracker to continue." : err.message);
        if (err.status !== 401) this.rejected.set(opKey(op), op);
      },
      onConflict: async () => {
        this.failed = true;
        ev.notify("info", "This problem changed elsewhere. Loading the saved version.");
        await this.refresh().catch(() => {});
      },
    });
  }

  async start() { await this.refresh(); }
  destroy() { this.destroyed = true; this.queue.destroy(); }
  flush() { this.queue.flushNow(); }
  flushOnExit(progress: Progress) {
    if (this.destroyed || this.exclusive || this.mode !== "synced") return;
    this.queue.flushNow();
    // A lone preference request already uses keepalive. Only send a full
    // fallback when newer preferences are waiting behind another request.
    const pending = this.queue.pendingOps();
    if (!pending.slice(1).some((op) => op.kind === "prefs")) return;
    const patch = { filters: progress.prefs.filters, ui: progress.prefs.ui, celebratedMilestones: progress.prefs.celebratedMilestones };
    const key = JSON.stringify(patch);
    if (key === this.exitSnapshotKey) return;
    this.exitSnapshotKey = key;
    void api.patchPreferences(patch).catch(() => { this.exitSnapshotKey = ""; });
  }
  hasPending() { return this.status.pending > 0 || this.rejected.size > 0; }
  retry() {
    if (this.mode !== "synced") return;
    const ops = [...this.rejected.values()];
    this.rejected.clear(); this.failed = false;
    for (const op of ops) this.queue.enqueue(op);
    this.queue.flushNow();
  }
  track(prev: Progress, next: Progress) {
    if (this.mode !== "synced" || this.exclusive) return;
    for (const change of diffProgress(prev, next)) {
      const rejected = this.rejected.get(opKey(change));
      const op = rejected ? mergeOps(rejected, change) : change;
      this.rejected.delete(opKey(op));
      this.failed = this.rejected.size > 0;
      this.queue.enqueue(op);
    }
  }
  private adopt(s: SnapshotDTO) {
    if (this.destroyed) return;
    const p = validateProgress(s, PROBLEM_IDS);
    if (!p) throw new Error("Server returned invalid progress");
    this.stamps = s.rowUpdatedAt;
    this.ev.onAchievements?.(s.achievements ?? [], []);
    this.ev.apply([...this.rejected.values(), ...this.queue.pendingOps()].reduce((acc, op) => applyOp(acc, op), p));
  }
  async refresh() {
    try {
      const snapshot = await api.getSnapshot();
      this.adopt(snapshot);
      if (!this.destroyed) { this.mode = "synced"; this.ev.onMode(this.mode); }
    } catch (e) {
      if (!this.destroyed) {
        this.mode = e instanceof ApiClientError && e.status === 401 ? "unauthenticated" : "unknown";
        this.ev.onMode(this.mode);
      }
      throw e;
    }
  }
  private async send(op: SyncOp) {
    if (this.mode !== "synced") throw new ApiClientError("UNAUTHENTICATED", 401, "Sign in required");
    if (op.kind === "prefs") return api.patchPreferences({ ui: op.ui, filters: op.filters, celebratedMilestones: op.celebratedMilestones });
    if (op.kind === "plan") return api.putPlan(op.startDate);
    const row = await api.putProgress(op.problemId, { ...op.body, clientUpdatedAt: this.stamps[op.problemId] });
    this.stamps[op.problemId] = row.updatedAt;
    if (!this.destroyed && row.achievements) this.ev.onAchievements?.(row.achievements, row.newAchievements ?? []);
  }
  private async drain() {
    if (this.rejected.size) throw new Error("Some changes failed to save. Retry saving before continuing.");
    this.queue.flushNow();
    const deadline = Date.now() + 15_000;
    while (this.hasPending()) {
      if (this.destroyed || Date.now() > deadline || this.status.state === "offline") throw new Error("Changes are still unsaved. Retry when the server is available.");
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    if (this.failed) throw new Error("A change failed to save. Review your progress before continuing.");
  }
  async runExclusive(action: () => Promise<unknown>) {
    if (this.exclusive || this.mode !== "synced") throw new Error("Wait for the current operation or sign in first.");
    this.exclusive = true;
    try { await this.drain(); await action(); await this.refresh(); }
    finally { this.exclusive = false; }
  }
  importReplace(p: Progress) { return this.runExclusive(async () => { const result = await api.importData("replace", p); if (!this.destroyed && result.achievements) this.ev.onAchievements?.(result.achievements, result.newAchievements ?? []); }); }
  reset() { return this.runExclusive(() => api.resetAll()); }
  async lock() {
    if (this.exclusive || this.mode !== "synced") throw new Error("Wait for the current operation before locking.");
    this.exclusive = true;
    try { await this.drain(); await api.lock(); this.destroy(); }
    finally { this.exclusive = false; }
  }
  async exportText() { await this.drain(); return api.exportText(); }
}
