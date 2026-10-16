export type Difficulty = "Easy" | "Medium" | "Hard";

export interface Problem {
  /** Stable ID derived from takeuforward's own item id, e.g. "tuf-37". */
  id: string;
  title: string;
  /** Top-level sheet module, e.g. "Binary Search". */
  topic: string;
  /** Sub-module inside the topic, e.g. "FAQs". */
  subtopic: string;
  /** Mapped from takeuforward's basic / core / pro tier. */
  difficulty: Difficulty;
  tier?: string;
  /** Preferred practice link (LeetCode when the sheet provides one). */
  url: string;
  /** takeuforward practice page for the same problem. */
  tufUrl: string;
  leetcodeUrl?: string;
  /** GeeksforGeeks practice link (from geckguy.github.io/striver-a2z-sheet), when the sheet pairs one. */
  gfgUrl?: string;
  /** C++ solution in Codensity30/Strivers-A2Z-DSA-Sheet, only when a confident title match exists. */
  solutionUrl?: string;
  /** Java solution in Bharat2044/Striver-A2Z-DSA-Sheet-Solution-using-JAVA, same matching rule. */
  javaSolutionUrl?: string;
}

export type RevisionStatus = "needs-revision" | "mastered";
export type StatusFilter = "all" | "completed" | "pending";
/** Retained for version-1 backup compatibility; scheduling filters are retired. */
export type DateFilter = "all";
export type SortKey = "schedule" | "title" | "difficulty" | "topic" | "status";

export interface Filters {
  difficulty: "All" | Difficulty;
  topic: string; // "All" or a topic name
  status: StatusFilter;
  date: DateFilter;
  query: string;
  sort: SortKey;
}

export interface CompletionRecord {
  /** ISO date the problem was ticked off. */
  date: string;
  /** Epoch ms, used for "recently completed" ordering. */
  at: number;
}

export interface UiPreferences {
  /** One-based page in the problems list. */
  problemPage?: number;
  problemLayout?: "grid" | "list";
  activityRange?: "year" | "30d" | "7d";
  theme: "system" | "light" | "dark";
  sidebarCollapsed: boolean;
}

export interface Preferences {
  ui?: UiPreferences;
  filters: Filters;
  celebratedMilestones: number[];
}

export interface Progress {
  version: 1;
  startDate: string;
  completed: Record<string, CompletionRecord>;
  notes: Record<string, string>;
  revision: Record<string, RevisionStatus>;
  prefs: Preferences;
}

export const DEFAULT_FILTERS: Filters = {
  difficulty: "All",
  topic: "All",
  status: "all",
  date: "all",
  query: "",
  sort: "schedule",
};
