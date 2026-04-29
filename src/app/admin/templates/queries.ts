// Project template reads. A second query gets milestone counts per
// template in one GROUP BY round-trip instead of N+1-ing.

import { asc, count, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import {
  projectTemplates,
  templateMilestones,
  templatePhaseDependencies,
  templatePhases,
} from '@/db/schema';
import { getSignedUrls } from '@/lib/storage/upload';

export interface TemplateListRow {
  id: string;
  name: string;
  type: 'maintenance' | 'remodel';
  description: string | null;
  duration: string | null;
  createdAt: Date;
  milestoneCount: number;
  usesPhases: boolean;
  /** Pre-signed URL for the first decision-option image found across this
   *  template's milestones — used as the editorial cover on the card grid.
   *  Null when no option has a storage path; callers fall back to a
   *  gradient cover keyed off the template id. */
  coverImageUrl: string | null;
}

export interface TemplateMilestoneRow {
  id: string;
  templateId: string;
  title: string;
  category: string | null;
  offset: string | null;
  order: number;
}

export async function listTemplates(): Promise<TemplateListRow[]> {
  const templates = await db
    .select({
      id: projectTemplates.id,
      name: projectTemplates.name,
      type: projectTemplates.type,
      description: projectTemplates.description,
      duration: projectTemplates.duration,
      createdAt: projectTemplates.createdAt,
      usesPhases: projectTemplates.usesPhases,
    })
    .from(projectTemplates)
    .orderBy(asc(projectTemplates.name));

  if (templates.length === 0) return [];

  const templateIds = templates.map((t) => t.id);

  // Two parallel reads: milestone counts (for the meta line) and the
  // jsonb `decisionOptions` payload across every template's milestones
  // (so we can extract the first option image per template for the
  // editorial card cover).
  const [milestoneCountRows, optionRows] = await Promise.all([
    db
      .select({
        templateId: templateMilestones.templateId,
        count: count(),
      })
      .from(templateMilestones)
      .groupBy(templateMilestones.templateId),
    db
      .select({
        templateId: templateMilestones.templateId,
        order: templateMilestones.order,
        decisionOptions: templateMilestones.decisionOptions,
      })
      .from(templateMilestones)
      .where(inArray(templateMilestones.templateId, templateIds))
      .orderBy(asc(templateMilestones.order)),
  ]);

  const countMap = new Map(milestoneCountRows.map((r) => [r.templateId, Number(r.count)]));

  // Walk milestones in order; the first option storage path we hit per
  // template wins. Anything else gets thrown away — we only need the
  // single cover candidate.
  const coverPathByTemplate = new Map<string, string>();
  for (const m of optionRows) {
    if (coverPathByTemplate.has(m.templateId)) continue;
    if (!Array.isArray(m.decisionOptions)) continue;
    for (const raw of m.decisionOptions) {
      if (raw && typeof raw === 'object') {
        const path = (raw as Record<string, unknown>).imageStoragePath;
        if (typeof path === 'string' && path) {
          coverPathByTemplate.set(m.templateId, path);
          break;
        }
      }
    }
  }

  // Sign all cover paths in one batch.
  const allPaths = Array.from(coverPathByTemplate.values());
  const urlByPath =
    allPaths.length > 0 ? await getSignedUrls(allPaths) : new Map<string, string>();

  return templates.map((t) => {
    const path = coverPathByTemplate.get(t.id);
    return {
      ...t,
      milestoneCount: countMap.get(t.id) ?? 0,
      coverImageUrl: path ? urlByPath.get(path) ?? null : null,
    };
  });
}

/**
 * Every milestone across every template, keyed by templateId. Cheaper
 * than a round-trip per card when the expand/collapse UI asks for any
 * template's milestones — we just hand over the full map.
 */
export async function listAllTemplateMilestones(): Promise<
  Map<string, TemplateMilestoneRow[]>
> {
  const rows = await db
    .select({
      id: templateMilestones.id,
      templateId: templateMilestones.templateId,
      title: templateMilestones.title,
      category: templateMilestones.category,
      offset: templateMilestones.offset,
      order: templateMilestones.order,
    })
    .from(templateMilestones)
    .orderBy(asc(templateMilestones.order));

  const byTemplate = new Map<string, TemplateMilestoneRow[]>();
  for (const r of rows) {
    const existing = byTemplate.get(r.templateId);
    if (existing) existing.push(r);
    else byTemplate.set(r.templateId, [r]);
  }
  return byTemplate;
}

// ---------- Phase-based template detail ----------

type TemplateRow = typeof projectTemplates.$inferSelect;
type PhaseRow = typeof templatePhases.$inferSelect;
type PhaseMilestoneRow = typeof templateMilestones.$inferSelect;

export interface PhaseWithContents extends PhaseRow {
  milestones: PhaseMilestoneRow[];
  /** Phase IDs this phase depends on (must complete first). */
  dependsOn: string[];
}

export type TemplateDetail =
  | (TemplateRow & { phases: PhaseWithContents[]; milestones: null })
  | (TemplateRow & { phases: null; milestones: PhaseMilestoneRow[] });

/**
 * Fetch a single template along with its content, handling both shapes:
 * - `uses_phases = true` — returns `phases[]` with milestones grouped per phase
 *   and each phase's `dependsOn` IDs.
 * - `uses_phases = false` — returns the legacy flat milestone list.
 *
 * Callers branch on the nullability of `phases` / `milestones` on the return
 * value, which is narrowed by the `usesPhases` flag on the underlying row.
 */
export async function getTemplateWithPhases(templateId: string): Promise<TemplateDetail | null> {
  const [template] = await db
    .select()
    .from(projectTemplates)
    .where(eq(projectTemplates.id, templateId))
    .limit(1);

  if (!template) return null;

  if (!template.usesPhases) {
    const milestones = await db
      .select()
      .from(templateMilestones)
      .where(eq(templateMilestones.templateId, templateId))
      .orderBy(asc(templateMilestones.order));
    return {
      ...template,
      phases: null,
      milestones: await hydrateOptionImages(milestones),
    };
  }

  const phases = await db
    .select()
    .from(templatePhases)
    .where(eq(templatePhases.templateId, templateId))
    .orderBy(asc(templatePhases.order));

  if (phases.length === 0) {
    return { ...template, phases: [], milestones: null };
  }

  const phaseIds = phases.map((p) => p.id);

  // Two parallel reads — milestones + dependencies — keyed by the same
  // phase-id list. `inArray` is cheaper than N+1-ing per phase.
  const [milestones, dependencies] = await Promise.all([
    db
      .select()
      .from(templateMilestones)
      .where(inArray(templateMilestones.phaseId, phaseIds))
      .orderBy(asc(templateMilestones.order)),
    db
      .select()
      .from(templatePhaseDependencies)
      .where(inArray(templatePhaseDependencies.phaseId, phaseIds)),
  ]);

  const hydratedMilestones = await hydrateOptionImages(milestones);

  const milestonesByPhase = new Map<string, PhaseMilestoneRow[]>();
  for (const m of hydratedMilestones) {
    if (!m.phaseId) continue;
    const existing = milestonesByPhase.get(m.phaseId);
    if (existing) existing.push(m);
    else milestonesByPhase.set(m.phaseId, [m]);
  }

  const depsByPhase = new Map<string, string[]>();
  for (const d of dependencies) {
    const existing = depsByPhase.get(d.phaseId);
    if (existing) existing.push(d.dependsOnPhaseId);
    else depsByPhase.set(d.phaseId, [d.dependsOnPhaseId]);
  }

  const phasesWithContents: PhaseWithContents[] = phases.map((p) => ({
    ...p,
    milestones: milestonesByPhase.get(p.id) ?? [],
    dependsOn: depsByPhase.get(p.id) ?? [],
  }));

  return { ...template, phases: phasesWithContents, milestones: null };
}

/**
 * Sign decision-option images in one batch and return the milestones with
 * an `imageUrl` attached to each option that has a stored path. Plain
 * strings (legacy seed format) are normalized into `{ label }` objects so
 * the rest of the pipeline can ignore the difference.
 */
async function hydrateOptionImages(
  rows: PhaseMilestoneRow[],
): Promise<PhaseMilestoneRow[]> {
  // 1. Walk every decision-point milestone and collect the unique paths.
  const allPaths = new Set<string>();
  for (const m of rows) {
    if (!m.isDecisionPoint || !Array.isArray(m.decisionOptions)) continue;
    for (const raw of m.decisionOptions) {
      const path = readImagePath(raw);
      if (path) allPaths.add(path);
    }
  }

  // 2. One batch round-trip to Supabase storage instead of N signed-URL
  //    calls. Empty path set short-circuits inside getSignedUrls.
  const urlByPath =
    allPaths.size > 0 ? await getSignedUrls(Array.from(allPaths)) : new Map<string, string>();

  // 3. Rebuild the milestones with the hydrated option objects in place.
  return rows.map((m) => {
    if (!m.isDecisionPoint || !Array.isArray(m.decisionOptions)) return m;
    const hydrated = (m.decisionOptions as unknown[]).map((raw) => {
      if (typeof raw === 'string') {
        return {
          label: raw,
          imageStoragePath: null,
          imageUrl: null,
          description: null,
        };
      }
      const obj = (raw ?? {}) as Record<string, unknown>;
      const imageStoragePath =
        typeof obj.imageStoragePath === 'string' ? obj.imageStoragePath : null;
      return {
        label: typeof obj.label === 'string' ? obj.label : '',
        imageStoragePath,
        imageUrl: imageStoragePath ? urlByPath.get(imageStoragePath) ?? null : null,
        description: typeof obj.description === 'string' ? obj.description : null,
      };
    });
    return { ...m, decisionOptions: hydrated };
  });
}

function readImagePath(raw: unknown): string | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  return typeof obj.imageStoragePath === 'string' ? obj.imageStoragePath : null;
}
