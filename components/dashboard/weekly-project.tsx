"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FolderKanban } from "lucide-react";
import { Panel } from "@/components/common/panel";
import { SectionTitle } from "@/components/common/section-title";
import { Button, buttonVariants } from "@/components/ui/button";
import { useTracker } from "@/hooks/use-tracker";
import { formatDate } from "@/lib/dates";
import { projectProgress, projectStatus, projectWeek, type WeeklyProjectDTO } from "@/lib/projects";

export function WeeklyProject() {
  const { today } = useTracker();
  const [project, setProject] = useState<WeeklyProjectDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const week = projectWeek(today);

  useEffect(() => {
    let controller: AbortController | undefined;
    async function load() {
      controller?.abort();
      const current = new AbortController();
      controller = current;
      try {
        const response = await fetch("/api/v1/projects", { cache: "no-store", signal: current.signal });
        if (!response.ok) throw new Error("Unable to load this week’s project.");
        const projects: WeeklyProjectDTO[] = await response.json();
        if (current.signal.aborted) return;
        setProject(projects.find((row) => row.weekStart === week) ?? null);
        setError("");
      } catch {
        if (!current.signal.aborted) setError("Unable to load this week’s project.");
      } finally {
        if (!current.signal.aborted) setLoading(false);
      }
    }
    void load();
    const refresh = () => { if (document.visibilityState === "visible") void load(); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      controller?.abort();
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [week, retry]);

  const current = project?.weekStart === week ? project : null;
  const progress = current ? projectProgress(current) : null;
  return <Panel>
    <SectionTitle icon={<FolderKanban className="size-4 text-primary" />} title="This week’s project" action={<Link href="/projects" className={buttonVariants({ variant: "ghost", size: "sm" })}>View projects</Link>} />
    {loading ? <p role="status" className="animate-pulse text-sm text-muted-foreground">Loading this week’s project…</p> : error ? <div className="space-y-3"><p role="alert" className="text-sm text-destructive">{error}</p><Button variant="outline" onClick={() => { setLoading(true); setRetry((value) => value + 1); }}>Try again</Button></div> : current && progress ? <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><Link href="/projects" className="break-words font-heading text-lg font-semibold hover:text-primary hover:underline">{current.name}</Link><p className="mt-1 text-xs text-muted-foreground">{formatDate(current.startDate, { day: "numeric", month: "short" })} – {formatDate(current.endDate, { day: "numeric", month: "short", year: "numeric" })}</p></div><span className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs text-primary">{projectStatus(current, today)}</span></div>
      <div aria-live="polite" className="space-y-2"><div className="flex justify-between gap-3 text-sm"><span className="text-muted-foreground">{progress.completed} of {progress.total} points completed</span><span className="font-semibold tabular-nums text-primary">{progress.percent}%</span></div><div role="progressbar" aria-label={`${current.name} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent} className="h-2 overflow-hidden rounded-full bg-primary/10"><div className="h-full rounded-full bg-primary transition-[width] motion-reduce:transition-none" style={{ width: `${progress.percent}%` }} /></div></div>
    </div> : <div className="space-y-3"><p className="text-sm text-muted-foreground">No project planned for this week. Choose your next build and start making progress.</p><Link href="/projects" className={buttonVariants({ variant: "outline" })}>Plan a project</Link></div>}
  </Panel>;
}
