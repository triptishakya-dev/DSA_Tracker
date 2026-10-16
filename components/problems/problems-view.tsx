"use client";

import { useEffect } from "react";
import { ChevronLeft, ChevronRight, LayoutGrid, List } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { QuoteCard } from "@/components/common/quote-card";
import { Button } from "@/components/ui/button";
import { useTracker } from "@/hooks/use-tracker";
import { PROBLEMS } from "@/lib/problems";
import { DIFFICULT_PROBLEM_QUOTES, dailyQuote } from "@/lib/quotes";
import type { SortKey } from "@/lib/types";
import { FilterBar } from "./filter-bar";
import { ProblemCard } from "./problem-card";

const PAGE_SIZE = 20;

export function ProblemsView() {
  const { filtered, filters, setFilters, today, progress, setUi, ready } = useTracker();
  const layout = progress.prefs.ui?.problemLayout ?? "list";
  const setLayout = (problemLayout: "grid" | "list") => setUi({ problemLayout });
  const savedPage = progress.prefs.ui?.problemPage ?? 1;
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.max(1, Math.min(savedPage, pages));
  const cur = page - 1;
  const setPage = (index: number) => setUi({ problemPage: index + 1 });

  // A completion/status change can shrink the results without changing the filters.
  // Wait for the database snapshot before correcting a now-unavailable saved page.
  useEffect(() => {
    if (ready && savedPage !== page) setUi({ problemPage: page });
  }, [ready, savedPage, page, setUi]);
  const slice = filtered.slice(cur * PAGE_SIZE, (cur + 1) * PAGE_SIZE);

  return (
    <div className="grid gap-4">
      <FilterBar total={PROBLEMS.length} />
      {filters.difficulty === "Hard" && (
        <QuoteCard label="For the hard problems" quote={dailyQuote(DIFFICULT_PROBLEM_QUOTES, today)} />
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <label htmlFor="sort">Sort by</label>
          <select
            id="sort"
            value={filters.sort}
            onChange={(e) => setFilters({ sort: e.target.value as SortKey })}
            className="h-10 rounded-lg border border-input bg-background/60 px-3 text-sm text-foreground dark:bg-input/30"
          >
            <option value="schedule">Sheet order</option>
            <option value="title">Title (A–Z)</option>
            <option value="difficulty">Difficulty</option>
            <option value="topic">Topic</option>
            <option value="status">Pending first</option>
          </select>
        </div>
        <div role="group" aria-label="Problem card layout" className="inline-flex rounded-xl border border-border bg-muted/50 p-1">
          <button
            type="button"
            aria-pressed={layout === "list"}
            onClick={() => setLayout("list")}
            className={`inline-flex min-h-9 items-center gap-2 rounded-lg px-3 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring ${layout === "list" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            <List className="size-4" aria-hidden /> Full row
          </button>
          <button
            type="button"
            aria-pressed={layout === "grid"}
            onClick={() => setLayout("grid")}
            className={`inline-flex min-h-9 items-center gap-2 rounded-lg px-3 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring ${layout === "grid" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            <LayoutGrid className="size-4" aria-hidden /> Two per row
          </button>
        </div>
      </div>
      {filtered.length === 0 ? (
        <EmptyState title="No problems match these filters" hint="Try removing a filter or clearing them all." />
      ) : (
        <div className={`grid gap-2.5 ${layout === "grid" ? "xl:grid-cols-2" : "grid-cols-1"}`}>
          {slice.map((p) => (
            <ProblemCard key={p.id} problem={p} />
          ))}
        </div>
      )}
      {pages > 1 && (
        <nav aria-label="Pagination" className="flex items-center justify-center gap-3">
          <Button variant="outline" size="sm" disabled={cur === 0} onClick={() => setPage(cur - 1)}>
            <ChevronLeft /> Prev
          </Button>
          <span className="text-sm tabular-nums text-muted-foreground">
            Page {cur + 1} of {pages}
          </span>
          <Button variant="outline" size="sm" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>
            Next <ChevronRight />
          </Button>
        </nav>
      )}
    </div>
  );
}
