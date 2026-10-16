"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Award, BarChart3, CheckCircle2, Gauge, History } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { Panel } from "@/components/common/panel";
import { QuoteCard } from "@/components/common/quote-card";
import { SectionTitle } from "@/components/common/section-title";
import { TopicBars } from "@/components/topics/topic-bars";
import { buttonVariants } from "@/components/ui/button";
import { useTracker } from "@/hooks/use-tracker";
import { formatDate } from "@/lib/dates";
import { PROBLEMS } from "@/lib/problems";
import { DASHBOARD_QUOTES, dailyQuote } from "@/lib/quotes";
import { recentlyCompleted } from "@/lib/stats";
import { ActivityHeatmap } from "./activity-heatmap";
import { ActivityChart } from "./activity-chart";
import { Hero } from "./hero";
import { Milestones } from "./milestones";
import { PosterCard } from "./poster-card";
import { StatCards } from "./stat-cards";
import { WeeklyProject } from "./weekly-project";

export function DashboardView() {
  const { today, progress } = useTracker();
  const recent = useMemo(() => recentlyCompleted(PROBLEMS, progress.completed, 5), [progress.completed]);

  return (
    <div className="grid gap-5">
      <Hero />
      <StatCards />
      <WeeklyProject />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="grid min-w-0 content-start gap-5 lg:col-span-2">
          <QuoteCard label="Daily motivation" quote={dailyQuote(DASHBOARD_QUOTES, today)} />
        <Panel>
          <SectionTitle
            icon={<Gauge className="size-4 text-primary" />}
            title="Topic progress"
            action={<Link href="/topics" className={buttonVariants({ variant: "ghost", size: "sm" })}>All topics</Link>}
          />
          <TopicBars limit={8} />
        </Panel>
        <ActivityHeatmap />

        </div>
        <div className="grid content-start gap-5">
          <PosterCard />
          <Panel>
            <SectionTitle icon={<Award className="size-4 text-success" />} title="Milestones" action={<Link href="/milestones" className={buttonVariants({ variant: "ghost", size: "sm" })}>View all milestones</Link>} />
            <Milestones compact />
          </Panel>
        </div>
      </div>

      <div className="grid content-start gap-5 lg:grid-cols-2">
          <Panel>
            <SectionTitle
              icon={<BarChart3 className="size-4 text-primary" />}
              title="Recent activity"
              action={<Link href="/stats" className={buttonVariants({ variant: "ghost", size: "sm" })}>Analytics</Link>}
            />
            <ActivityChart />
          </Panel>
          <Panel>
            <SectionTitle icon={<History className="size-4 text-primary" />} title="Recently completed" />
            {recent.length === 0 ? (
              <EmptyState title="Nothing solved yet" hint="Tick off your first problem and it will show up here." />
            ) : (
              <ul className="grid gap-1.5">
                {recent.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden />
                      <span className="truncate">{p.title}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">{formatDate(progress.completed[p.id].date, { day: "numeric", month: "short" })}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
      </div>
    </div>
  );
}
