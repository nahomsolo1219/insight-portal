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

export interface TemplateListRow {
  id: string;
  name: string;
  type: 'maintenance' | 'remodel';
  description: string | null;
  duration: string | null;
  createdAt: Date;
  milestoneCount: number;
  usesPhases: boolean;
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

  const milestoneCountRows = await db
    .select({
      templateId: templateMilestones.templateId,
      count: count(),
    })
    .from(templateMilestones)
    .groupBy(templateMilestones.templateId);

  const countMap = new Map(milestoneCountRows.map((r) => [r.templateId, Number(r.count)]));

  return templates.map((t) => ({ ...t, milestoneCount: countMap.get(t.id) ?? 0 }));
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
    return { ...template, phases: null, milestones };
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

  const milestonesByPhase = new Map<string, PhaseMilestoneRow[]>();
  for (const m of milestones) {
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
