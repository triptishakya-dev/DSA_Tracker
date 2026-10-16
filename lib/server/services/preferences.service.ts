import "server-only";
import { DEFAULT_FILTERS, type Filters, type Preferences, type UiPreferences } from "@/lib/types";
import { sanitizeFilters } from "@/lib/progress";
import { db } from "../db";

const DEFAULT_PREFS: Preferences = { ui: { theme: "system", sidebarCollapsed: false }, filters: { ...DEFAULT_FILTERS }, celebratedMilestones: [] };

function merge(stored: { filters: unknown; celebratedMilestones: number[]; ui?: unknown } | null): Preferences {
  if (!stored) return DEFAULT_PREFS;
  const ui = { ...(stored.ui as Record<string, unknown> ?? {}) };
  delete ui.problemScrollY;
  return {
    ui: { ...DEFAULT_PREFS.ui!, ...ui },
    filters: sanitizeFilters(stored.filters),
    celebratedMilestones: stored.celebratedMilestones,
  };
}

export async function getPreferences(userId: string): Promise<Preferences> {
  return merge(await db.userPreferences.findUnique({ where: { userId } }));
}

export async function patchPreferences(
  userId: string,
  patch: { mutation?: { sessionId: string; sequence: number }; ui?: Partial<UiPreferences>; filters?: Partial<Filters>; celebratedMilestones?: number[] },
): Promise<Preferences> {
  return db.$transaction(async (tx) => {
    // Lock the stable account row, including when its preferences do not exist yet.
    // This also prevents concurrent partial preference updates losing one another.
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    const stored = await tx.userPreferences.findUnique({ where: { userId } });
    const current = merge(stored);
    const versions = (stored?.writeVersions ?? {}) as Record<string, { sequence: number; at: number }>;
    if (patch.mutation) {
      const seen = versions[patch.mutation.sessionId];
      if (seen && seen.sequence >= patch.mutation.sequence) return current;
    }
    const filters = { ...current.filters, ...patch.filters };
    const filtersChanged = (Object.keys(filters) as (keyof Filters)[]).some((key) => filters[key] !== current.filters[key]);
    const next: Preferences = {
      ui: { ...current.ui!, ...(filtersChanged ? { problemPage: 1 } : {}), ...patch.ui },
      filters,
      celebratedMilestones: patch.celebratedMilestones ?? current.celebratedMilestones,
    };
    const now = Date.now();
    // Retain session ordering for a day; requests have a 15-second client timeout.
    const writeVersions = Object.fromEntries(Object.entries(versions).filter(([, value]) => value.at >= now - 86_400_000));
    if (patch.mutation) writeVersions[patch.mutation.sessionId] = { sequence: patch.mutation.sequence, at: now };
    const data = { ui: { ...next.ui }, filters: { ...next.filters }, celebratedMilestones: next.celebratedMilestones, writeVersions };
    const row = await tx.userPreferences.upsert({ where: { userId }, create: { userId, ...data }, update: data });
    return merge(row);
  });
}
