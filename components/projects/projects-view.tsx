"use client";

import { useEffect, useState } from "react";
import { CalendarDays, CheckCheck, FolderKanban, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Panel } from "@/components/common/panel";
import { PageHeader } from "@/components/layout/page-header";
import { addDays, formatDate, todayIso } from "@/lib/dates";
import { projectDetailsSchema, projectProgress, projectStatus, projectWeek, type ProjectDetails, type WeeklyProjectDTO } from "@/lib/projects";
import { cn } from "@/lib/utils";

async function request<T>(path = "", method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(`/api/v1/projects${path}`, { method, cache: "no-store", headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.error?.fields ? Object.values(result.error.fields).join(". ") : result.error?.message ?? "Unable to save projects");
  }
  return response.status === 204 ? undefined as T : response.json();
}
const shortDate = (date: string) => formatDate(date, { day: "numeric", month: "short", year: "numeric" });

function ProjectForm({ initial, saving, error, onSave, onCancel }: { initial: ProjectDetails; saving: boolean; error: string; onSave: (value: ProjectDetails) => void; onCancel: () => void }) {
  const [value, setValue] = useState<ProjectDetails>({ name: initial.name, startDate: initial.startDate, endDate: initial.endDate, descriptionPoints: initial.descriptionPoints });
  const [validation, setValidation] = useState("");
  return <form className="space-y-4" onSubmit={(event) => {
    event.preventDefault();
    const parsed = projectDetailsSchema.safeParse(value);
    if (!parsed.success) { setValidation(parsed.error.issues.map((issue) => issue.message).join(". ")); return; }
    setValidation(""); onSave(parsed.data);
  }}>
    <fieldset disabled={saving} className="space-y-4">
      <label className="block space-y-2 text-sm font-medium">Project name<Input autoFocus required maxLength={150} value={value.name} onChange={(e) => setValue({ ...value, name: e.target.value })} placeholder="What will you build?" /></label>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block space-y-2 text-sm font-medium">Start date<Input required type="date" value={value.startDate} onChange={(e) => setValue({ ...value, startDate: e.target.value, endDate: e.target.value ? addDays(e.target.value, 7) : "" })} /></label>
        <label className="block space-y-2 text-sm font-medium">End date<Input required type="date" min={value.startDate} max={value.startDate ? addDays(value.startDate, 7) : undefined} value={value.endDate} onChange={(e) => setValue({ ...value, endDate: e.target.value })} /></label>
      </div>
      <p className="text-xs text-muted-foreground">One project per start week. Plan a build lasting up to seven days.</p>
      <div className="space-y-2">
        <p className="text-sm font-medium">Description points</p>
        {value.descriptionPoints.map((point, index) => <div key={index} className="flex items-start gap-2">
          <Textarea required maxLength={1000} rows={2} aria-label={`Description point ${index + 1}`} placeholder={`Goal or feature ${index + 1}`} value={point} onChange={(e) => setValue({ ...value, descriptionPoints: value.descriptionPoints.map((p, i) => i === index ? e.target.value : p) })} />
          <Button type="button" variant="ghost" size="icon" disabled={value.descriptionPoints.length === 1} aria-label={`Remove point ${index + 1}`} onClick={() => setValue({ ...value, descriptionPoints: value.descriptionPoints.filter((_, i) => i !== index) })}><X /></Button>
        </div>)}
        <Button type="button" variant="outline" disabled={value.descriptionPoints.length >= 30} onClick={() => setValue({ ...value, descriptionPoints: [...value.descriptionPoints, ""] })}><Plus />Add point</Button>
      </div>
    </fieldset>
    {(validation || error) && <p role="alert" className="text-sm text-destructive">{validation || error}</p>}
    <div className="flex justify-end gap-2 border-t border-border pt-4"><Button type="button" variant="outline" disabled={saving} onClick={onCancel}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save project"}</Button></div>
  </form>;
}

export function ProjectsView() {
  const [projects, setProjects] = useState<WeeklyProjectDTO[]>([]);
  const [today, setToday] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<WeeklyProjectDTO | "new" | null>(null);
  const [deleting, setDeleting] = useState<WeeklyProjectDTO | null>(null);
  async function load() {
    setLoading(true); setLoadError("");
    try { setProjects(await request<WeeklyProjectDTO[]>()); }
    catch (e) { setLoadError((e as Error).message); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    let active = true;
    const updateToday = () => setToday(todayIso());
    updateToday();
    const timer = setInterval(updateToday, 60_000);
    request<WeeklyProjectDTO[]>().then((data) => { if (active) setProjects(data); }).catch((e: Error) => { if (active) setLoadError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; clearInterval(timer); };
  }, []);
  const currentWeek = today ? projectWeek(today) : "";
  function open(project: WeeklyProjectDTO | "new") { setError(""); setEditing(project); }
  async function save(value: ProjectDetails) {
    setSaving(true); setError("");
    try {
      const row = await request<WeeklyProjectDTO>(editing === "new" ? "" : `/${(editing as WeeklyProjectDTO).id}`, editing === "new" ? "POST" : "PATCH", value);
      setProjects((rows) => [...rows.filter((p) => p.id !== row.id), row].sort((a, b) => b.weekStart.localeCompare(a.weekStart)));
      setEditing(null);
    } catch (e) { setError((e as Error).message); } finally { setSaving(false); }
  }
  async function toggle(project: WeeklyProjectDTO, pointIndex?: number) {
    setSaving(true); setError("");
    try {
      const row = await request<WeeklyProjectDTO>(`/${project.id}`, "PATCH", pointIndex === undefined ? { completed: !project.completedAt } : { pointIndex, pointText: project.descriptionPoints[pointIndex], completed: !(project.completedPoints?.[pointIndex] ?? !!project.completedAt) });
      setProjects((rows) => rows.map((p) => p.id === row.id ? row : p));
    } catch (e) { setError((e as Error).message); } finally { setSaving(false); }
  }
  async function remove() {
    if (!deleting) return;
    setSaving(true); setError("");
    try { await request(`/${deleting.id}`, "DELETE"); setProjects((rows) => rows.filter((p) => p.id !== deleting.id)); setDeleting(null); }
    catch (e) { setError((e as Error).message); } finally { setSaving(false); }
  }
  return <div className="space-y-5">
    <PageHeader title="Weekly Projects" />
    <Panel className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><FolderKanban /></span><div><h2 className="font-heading text-lg font-semibold">One week. One product.</h2><p className="mt-1 text-sm text-muted-foreground">Plan a focused build, define its features, and ship something every week.</p><p className="mt-2 text-xs text-muted-foreground">{projects.length} planned · {projects.filter((p) => p.completedAt).length} completed</p></div></div>
      <Button size="lg" disabled={loading || !!loadError || !today} onClick={() => open("new")}><Plus />Add project</Button>
    </Panel>
    {error && !editing && !deleting && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {loading ? <Panel><p role="status" className="animate-pulse text-sm text-muted-foreground">Loading weekly projects…</p></Panel> : loadError ? <Panel><p role="alert" className="mb-3 text-sm text-destructive">{loadError}</p><Button variant="outline" onClick={load}>Try again</Button></Panel> : projects.length === 0 ? <Panel className="flex flex-col items-center gap-3 py-12 text-center"><CalendarDays className="size-8 text-primary" /><h2 className="font-heading text-lg font-semibold">Plan your first weekly build</h2><p className="max-w-sm text-sm text-muted-foreground">Choose one product, set your dates, and break the scope into clear points.</p><Button onClick={() => open("new")}><Plus />Plan this week</Button></Panel> : <ul aria-label="Weekly projects" className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{projects.map((project) => {
      const status = projectStatus(project, today);
      const progress = projectProgress(project);
      const current = project.weekStart === currentWeek;
      return <li key={project.id} className="min-w-0"><article className={cn("glass rise flex h-full flex-col rounded-xl border p-4 sm:p-5", current ? "border-primary/40" : "border-border")}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs"><span className="text-muted-foreground">Week of {shortDate(project.weekStart)}</span>{current && <span className="rounded-full bg-primary/10 px-2 py-1 font-medium text-primary">This week</span>}</div>
        <h2 className="break-words font-heading text-lg font-semibold">{project.name}</h2>
        <span className={cn("mt-2 self-start rounded-full border px-2.5 py-1 text-xs", status === "Completed" ? "border-success/30 bg-success/10 text-success" : status === "Overdue" ? "border-warning/30 bg-warning/10 text-warning" : "border-primary/20 bg-primary/10 text-primary")}>{status}</span>
        <dl className="my-4 grid grid-cols-2 gap-3 text-xs"><div><dt className="text-muted-foreground">Start date</dt><dd className="mt-1">{shortDate(project.startDate)}</dd></div><div><dt className="text-muted-foreground">End date</dt><dd className="mt-1">{shortDate(project.endDate)}</dd></div></dl>
        <ul aria-label="Description points" className="mb-5 space-y-2 text-sm text-muted-foreground">{project.descriptionPoints.map((point, i) => <li key={i}><label className="flex cursor-pointer items-start gap-2"><Checkbox className="mt-0.5 shrink-0" checked={!!(project.completedPoints?.[i] ?? !!project.completedAt)} disabled={saving} onCheckedChange={() => toggle(project, i)} aria-label={`Mark point ${i + 1} of ${project.name} ${(project.completedPoints?.[i] ?? !!project.completedAt) ? "incomplete" : "complete"}`} /><span className={cn("min-w-0 whitespace-pre-wrap break-words", (project.completedPoints?.[i] ?? !!project.completedAt) && "line-through opacity-60")}>{point}</span></label></li>)}</ul>
        <div className="mb-4 space-y-2" aria-live="polite"><div className="flex justify-between gap-2 text-xs"><span className="text-muted-foreground">{progress.completed} of {progress.total} points completed</span><span className="font-medium text-primary">{progress.percent}%</span></div><div role="progressbar" aria-label={`${project.name} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent} className="h-2 overflow-hidden rounded-full bg-primary/10"><div className="h-full rounded-full bg-primary transition-[width] motion-reduce:transition-none" style={{ width: `${progress.percent}%` }} /></div></div>
        <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-border pt-3"><Button variant="outline" disabled={saving} onClick={() => toggle(project)}><CheckCheck />{project.completedAt ? "Reopen" : "Mark completed"}</Button><Button variant="ghost" size="icon" disabled={saving} aria-label={`Edit ${project.name}`} onClick={() => open(project)}><Pencil /></Button><Button variant="ghost" size="icon" disabled={saving} aria-label={`Delete ${project.name}`} onClick={() => { setError(""); setDeleting(project); }}><Trash2 /></Button></div>
      </article></li>;
    })}</ul>}
    <Dialog open={editing !== null} onOpenChange={(open) => { if (!open && !saving) setEditing(null); }}><DialogContent showCloseButton={!saving} className="max-h-[90dvh] overflow-y-auto sm:max-w-lg"><DialogTitle>{editing === "new" ? "Plan a weekly project" : "Edit weekly project"}</DialogTitle><DialogDescription>Choose a small product you can build in one week.</DialogDescription>{editing && <ProjectForm key={editing === "new" ? "new" : editing.id} initial={editing === "new" ? { name: "", startDate: today, endDate: addDays(today, 7), descriptionPoints: [""] } : editing} saving={saving} error={error} onSave={save} onCancel={() => setEditing(null)} />}</DialogContent></Dialog>
    <Dialog open={!!deleting} onOpenChange={(open) => { if (!open && !saving) setDeleting(null); }}><DialogContent showCloseButton={!saving}><DialogTitle>Delete project?</DialogTitle><DialogDescription>“{deleting?.name}” and its description points will be permanently removed.</DialogDescription>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<div className="flex justify-end gap-2"><Button variant="outline" disabled={saving} onClick={() => setDeleting(null)}>Cancel</Button><Button variant="destructive" disabled={saving} onClick={remove}>{saving ? "Deleting…" : "Delete project"}</Button></div></DialogContent></Dialog>
  </div>;
}
