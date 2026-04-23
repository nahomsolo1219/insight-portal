// Project template reads. A second query gets milestone counts per
// template in one GROUP BY round-trip instead of N+1-ing.

import { asc, count } from 'drizzle-orm';
import { db } from '@/db';
import { projectTemplates, templateMilestones } from '@/db/schema';

export interface TemplateListRow {
  id: string;
  name: string;
  type: 'maintenance' | 'remodel';
  description: string | null;
  duration: string | null;
  createdAt: Date;
  milestoneCount: number;
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
