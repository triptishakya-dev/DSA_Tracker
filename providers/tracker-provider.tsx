"use client";

import { createContext, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ACHIEVEMENTS, type AchievementDTO } from "@/lib/achievements";
import { toast } from "sonner";
import { todayIso } from "@/lib/dates";
import { applyFilters, sortProblems } from "@/lib/filters";
import { PROBLEMS } from "@/lib/problems";
import {
  overallProgress,
  streaksFromCompleted,
  topicProgress,
} from "@/lib/stats";
import { defaultProgress } from "@/lib/progress";
import { SyncController, type SyncMode } from "@/lib/sync/controller";
import type { SyncState } from "@/lib/sync/queue";
import { DEFAULT_FILTERS, type Filters, type Problem, type Progress, type RevisionStatus, type UiPreferences } from "@/lib/types";

export interface TrackerValue {
  achievements: AchievementDTO[];
  highlightedAchievement: string | null;
  /** False until the API snapshot has loaded (avoids hydration mismatch). */
  ready: boolean;
  progress: Progress;
  today: string;
  problemById: ReadonlyMap<string, Problem>;
  overall: ReturnType<typeof overallProgress>;
  streaks: { current: number; longest: number };
  topics: ReturnType<typeof topicProgress>;
  filters: Filters;
  filtered: Problem[];
  loadError: string | null;
  retryLoad: () => void;
  retrySave: () => void;
  flushSaves: () => void;
  busy: boolean;
  setUi: (patch: Partial<UiPreferences>) => void;
  sync: { enabled: boolean; mode: SyncMode; state: SyncState; pending: number };
  exportData: () => Promise<string>;
  toggleComplete: (id: string) => void;
  setNote: (id: string, note: string) => void;
  setRevision: (id: string, status: RevisionStatus | null) => void;
  setFilters: (patch: Partial<Filters>) => void;
  clearFilters: () => void;
  replaceProgress: (p: Progress) => Promise<void>;
  resetProgress: () => Promise<void>;
  lockTracker: () => Promise<void>;
}

export const TrackerContext = createContext<TrackerValue | null>(null);
const problemById = new Map(PROBLEMS.map((p) => [p.id, p]));

export function TrackerProvider({ children }: { children: ReactNode }) {
  const [achievements, setAchievements] = useState<AchievementDTO[]>([]);
  const [highlightedAchievement, setHighlightedAchievement] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress>(defaultProgress);
  const [ready, setReady] = useState(false);
  const [today, setToday] = useState("2026-10-13");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const ref = useRef(progress);
  const todayRef = useRef(today);
  const controllerRef = useRef<SyncController | null>(null);
  const [syncMode, setSyncMode] = useState<SyncMode>("unknown");
  const [syncState, setSyncState] = useState<{ state: SyncState; pending: number }>({ state: "idle", pending: 0 });
  useEffect(() => {
    let active = true;
    const t = todayIso();
    todayRef.current = t;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initialize the client clock alongside the API connection
    setToday(t);
    setLoadError(null);
    setReady(false);
    const controller = new SyncController({
      onAchievements: (earned, newly) => {
        if (!active) return;
        setAchievements(earned);
        if (newly.length) {
          const latest = ACHIEVEMENTS.filter((m) => newly.some((a) => a.tag === m.tag)).at(-1);
          if (latest) {
            setHighlightedAchievement(latest.tag);
            toast.success(newly.length === 1 ? `Achievement unlocked: ${latest.name}` : `${newly.length} achievements unlocked! ${latest.name}`, { id: `achievement-${latest.tag}` });
          }
        }
      },
      apply: (p) => { if (active) { ref.current = p; setProgress(p); } },
      onMode: (mode) => { if (active) { setSyncMode(mode); if (mode === "unknown") { setReady(false); setLoadError("Unable to load saved progress. Retry when connected."); } if (mode === "unauthenticated") { setReady(false); setLoadError("Your tracker is locked. Unlock it to continue."); } } },
      onStatus: (s) => { if (active) setSyncState(s); },
      notify: (kind, message) => kind === "error" ? toast.error(message) : toast(message),
    });
    controllerRef.current = controller;
    void controller.start().then(() => { if (active) setReady(true); }).catch((e) => {
      if (active) setLoadError(e instanceof Error ? e.message : "Unable to load progress");
    });
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (controller.hasPending()) { e.preventDefault(); e.returnValue = ""; }
    };
    const flush = () => controller.flushOnExit(ref.current);
    const hide = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("beforeunload", beforeUnload);
    return () => { active = false; controller.destroy(); controllerRef.current = null; window.removeEventListener("beforeunload", beforeUnload); window.removeEventListener("pagehide", flush); document.removeEventListener("visibilitychange", hide); };
  }, [attempt]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => document.documentElement.classList.toggle("dark", progress.prefs.ui?.theme === "dark" || ((progress.prefs.ui?.theme ?? "system") === "system" && media.matches));
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [progress.prefs.ui?.theme]);

  // Roll "today" over at midnight / when the tab regains focus.
  useEffect(() => {
    const tick = () => {
      const t = todayIso();
      if (t !== todayRef.current) {
        todayRef.current = t;
        setToday(t);
      }
    };
    const id = window.setInterval(tick, 30_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);

  useEffect(() => {
    if (!highlightedAchievement) return;
    const timer = window.setTimeout(() => setHighlightedAchievement(null), 5000);
    return () => window.clearTimeout(timer);
  }, [highlightedAchievement]);

  const commit = useCallback((next: Progress) => {
    if (busyRef.current || controllerRef.current?.mode !== "synced") return;
    const prev = ref.current;
    ref.current = next;
    setProgress(next);
    controllerRef.current.track(prev, next);
  }, []);

  const setUi = useCallback((patch: Partial<UiPreferences>) => {
    const prev = ref.current;
    commit({ ...prev, prefs: { ...prev.prefs, ui: { theme: "system", sidebarCollapsed: false, ...prev.prefs.ui, ...patch } } });
  }, [commit]);

  const toggleComplete = useCallback(
    (id: string) => {
      const prev = ref.current;
      const completed = { ...prev.completed };
      const t = todayRef.current;
      const wasDone = !!completed[id];
      if (wasDone) {
        delete completed[id];
        commit({ ...prev, completed });
        return;
      }
      completed[id] = { date: t, at: Date.now() };
      commit({ ...prev, completed });
    },
    [commit],
  );

  const setNote = useCallback(
    (id: string, note: string) => {
      const prev = ref.current;
      const notes = { ...prev.notes };
      if (note.trim()) notes[id] = note.slice(0, 5000);
      else delete notes[id];
      commit({ ...prev, notes });
    },
    [commit],
  );

  const setRevision = useCallback(
    (id: string, status: RevisionStatus | null) => {
      const prev = ref.current;
      const revision = { ...prev.revision };
      if (status) revision[id] = status;
      else delete revision[id];
      commit({ ...prev, revision });
    },
    [commit],
  );

  const setFilters = useCallback(
    (patch: Partial<Filters>) => {
      const prev = ref.current;
      const changed = (Object.keys(patch) as (keyof Filters)[]).some((key) => patch[key] !== prev.prefs.filters[key]);
      commit({ ...prev, prefs: {
        ...prev.prefs,
        filters: { ...prev.prefs.filters, ...patch },
        ui: { theme: "system", sidebarCollapsed: false, ...prev.prefs.ui, ...(changed ? { problemPage: 1 } : {}) },
      } });
    },
    [commit],
  );

  const clearFilters = useCallback(() => {
    const prev = ref.current;
    commit({ ...prev, prefs: { ...prev.prefs, ui: { theme: "system", sidebarCollapsed: false, ...prev.prefs.ui, problemPage: 1 }, filters: { ...DEFAULT_FILTERS, sort: prev.prefs.filters.sort } } });
  }, [commit]);

  const exclusive = useCallback(async (action: (c: SyncController) => Promise<unknown>) => {
    const c = controllerRef.current;
    if (!c || busyRef.current) throw new Error("Another operation is in progress");
    busyRef.current = true;
    setBusy(true);
    try { await action(c); } finally { busyRef.current = false; setBusy(false); }
  }, []);
  const replaceProgress = useCallback(async (p: Progress) => { await exclusive((c) => c.importReplace(p)); }, [exclusive]);
  const lockTracker = useCallback(async () => { await exclusive((c) => c.lock()); }, [exclusive]);
  const resetProgress = useCallback(async () => { await exclusive((c) => c.reset()); }, [exclusive]);
  const exportData = useCallback(async () => {
    const c = controllerRef.current;
    if (!c) throw new Error("Progress is not loaded");
    return c.exportText();
  }, []);

  const filters = progress.prefs.filters;
  const filtered = useMemo(
    () =>
      sortProblems(
        applyFilters(PROBLEMS, filters, { completed: progress.completed }),
        filters.sort,
        progress.completed,
      ),
    [filters, progress.completed],
  );

  const overall = useMemo(() => overallProgress(PROBLEMS, progress.completed), [progress.completed]);
  const streaks = useMemo(() => streaksFromCompleted(progress.completed, today), [progress.completed, today]);
  const topics = useMemo(() => topicProgress(PROBLEMS, progress.completed), [progress.completed]);

  const value: TrackerValue = {
    achievements, highlightedAchievement, ready, progress, today, problemById, overall, streaks, topics,
    filters, filtered, loadError, retryLoad: () => setAttempt((v) => v + 1), retrySave: () => controllerRef.current?.retry(), flushSaves: () => controllerRef.current?.flushOnExit(ref.current), busy, setUi,
    sync: { enabled: true, mode: syncMode, ...syncState }, exportData,
    toggleComplete, setNote, setRevision, setFilters, clearFilters, replaceProgress, resetProgress, lockTracker,
  };
  return <TrackerContext.Provider value={value}>{children}</TrackerContext.Provider>;
}
