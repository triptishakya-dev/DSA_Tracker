import { isIsoDate } from "./dates";
import { DEFAULT_START_DATE } from "./schedule";
import { DEFAULT_FILTERS, type Filters, type Progress } from "./types";

const SORTS = ["schedule", "title", "difficulty", "topic", "status"];
const STATUSES = ["all", "completed", "pending"];
const DIFFS = ["All", "Easy", "Medium", "Hard"];

export function defaultProgress(): Progress {
  return {
    version: 1,
    startDate: DEFAULT_START_DATE,
    completed: {},
    notes: {},
    revision: {},
    prefs: { ui: { theme: "system", sidebarCollapsed: false }, filters: { ...DEFAULT_FILTERS }, celebratedMilestones: [] },
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function sanitizeFilters(raw: unknown): Filters {
  const f = isObj(raw) ? raw : {};
  return {
    difficulty: DIFFS.includes(f.difficulty as string) ? (f.difficulty as Filters["difficulty"]) : "All",
    topic: typeof f.topic === "string" && f.topic ? f.topic : "All",
    status: STATUSES.includes(f.status as string) ? (f.status as Filters["status"]) : "all",
    date: "all", // Normalize retired schedule filters from older accounts and backups.
    query: typeof f.query === "string" ? f.query.slice(0, 200) : "",
    sort: SORTS.includes(f.sort as string) ? (f.sort as Filters["sort"]) : "schedule",
  };
}

/**
 * Strictly validate unknown data (from an API response or an imported file).
 * Returns a clean Progress, or null if the shape is not recognisable.
 * Entries for problem IDs not in `knownIds` are dropped when provided.
 */
export function validateProgress(raw: unknown, knownIds?: ReadonlySet<string>): Progress | null {
  if (!isObj(raw) || raw.version !== 1) return null;
  if (!isIsoDate(raw.startDate)) return null;
  if (!isObj(raw.completed) || !isObj(raw.notes) || !isObj(raw.revision)) return null;
  const keep = (id: string) => !knownIds || knownIds.has(id);

  const out = defaultProgress();
  out.startDate = raw.startDate;

  for (const [id, rec] of Object.entries(raw.completed)) {
    if (!isObj(rec) || !isIsoDate(rec.date) || typeof rec.at !== "number" || !Number.isFinite(rec.at)) return null;
    if (keep(id)) out.completed[id] = { date: rec.date, at: rec.at };
  }
  for (const [id, note] of Object.entries(raw.notes)) {
    if (typeof note !== "string") return null;
    if (keep(id) && note.trim()) out.notes[id] = note.slice(0, 5000);
  }
  for (const [id, st] of Object.entries(raw.revision)) {
    if (st !== "needs-revision" && st !== "mastered") return null;
    if (keep(id)) out.revision[id] = st;
  }
  if (isObj(raw.prefs)) {
    out.prefs.filters = sanitizeFilters(raw.prefs.filters);
    if (isObj(raw.prefs.ui)) {
      const ui = raw.prefs.ui;
      out.prefs.ui = {
        theme: ui.theme === "dark" || ui.theme === "light" ? ui.theme : "system",
        sidebarCollapsed: ui.sidebarCollapsed === true,
        ...(typeof ui.problemPage === "number" && Number.isInteger(ui.problemPage) && ui.problemPage >= 1 && ui.problemPage <= 10_000 ? { problemPage: ui.problemPage } : {}),
        ...(ui.problemLayout === "grid" || ui.problemLayout === "list" ? { problemLayout: ui.problemLayout } : {}),
        ...(ui.activityRange === "year" || ui.activityRange === "30d" || ui.activityRange === "7d" ? { activityRange: ui.activityRange } : {}),
      };
    }
    const cm = raw.prefs.celebratedMilestones;
    out.prefs.celebratedMilestones = Array.isArray(cm) ? cm.filter((n): n is number => typeof n === "number") : [];
  }
  return out;
}

export function exportProgress(progress: Progress): string {
  return JSON.stringify({ app: "dsa-tracker", exportedAt: new Date().toISOString(), ...progress }, null, 2);
}

export function parseImport(text: string, knownIds?: ReadonlySet<string>): Progress | null {
  try {
    return validateProgress(JSON.parse(text), knownIds);
  } catch {
    return null;
  }
}
