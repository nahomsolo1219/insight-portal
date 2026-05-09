// Copies a template's phase + milestone structure into a live project.
// Shared between the createProject server action and the seed script.

import { asc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import {
  milestones,
  projectTemplates,
  templateMilestones,
  templatePhases,
} from '@/db/schema';

/**
 * Copy a template's milestones into a new project. Both shapes are handled:
 *
 * - Phase-based templates (uses_phases = true): every template_milestone
 *   becomes a project milestone, with the template phase's title acting as
 *   the milestone category fallback. A phase with no milestones is
 *   represented by a single milestone titled with the phase name so empty
 *   phases still show up on the project's timeline.
 * - Legacy flat templates: template_milestones copy across one-for-one,
 *   preserving the original ordering.
 *
 * Decision points carry over their question fields (questionType /
 * questionBody / options jsonb). Status starts as `upcoming` for decisions
 * — David flips them to `awaiting_client` when ready to ask the client —
 * and `pending` for everything else.
 */
export async function applyTemplateToProject(projectId: string, templateId: string) {
  const [template] = await db
    .select({ usesPhases: projectTemplates.usesPhases })
    .from(projectTemplates)
    .where(eq(projectTemplates.id, templateId))
    .limit(1);

  if (!template) return;

  if (template.usesPhases) {
    const phases = await db
      .select()
      .from(templatePhases)
      .where(eq(templatePhases.templateId, templateId))
      .orderBy(asc(templatePhases.order));

    if (phases.length === 0) return;
    const phaseIds = phases.map((p) => p.id);

    const phaseMilestoneRows = await db
      .select()
      .from(templateMilestones)
      .where(inArray(templateMilestones.phaseId, phaseIds))
      .orderBy(asc(templateMilestones.order));

    type ProjectMilestoneInsert = typeof milestones.$inferInsert;
    const inserts: ProjectMilestoneInsert[] = [];
    let order = 0;

    for (const phase of phases) {
      const inThisPhase = phaseMilestoneRows.filter((m) => m.phaseId === phase.id);

      if (inThisPhase.length === 0) {
        inserts.push({
          projectId,
          title: phase.title,
          category: 'Phase',
          status: 'pending',
          notes: phase.description ?? null,
          order: order++,
        });
        continue;
      }

      for (const tm of inThisPhase) {
        inserts.push({
          projectId,
          title: tm.title,
          category: tm.category || phase.title,
          status: tm.isDecisionPoint ? 'upcoming' : 'pending',
          notes: tm.description ?? null,
          order: order++,
          questionType: tm.isDecisionPoint ? tm.decisionType : null,
          questionBody: tm.isDecisionPoint ? tm.decisionQuestion : null,
          options: tm.isDecisionPoint ? tm.decisionOptions : null,
        });
      }
    }

    if (inserts.length > 0) await db.insert(milestones).values(inserts);
    return;
  }

  // Legacy flat template
  const flatMilestones = await db
    .select()
    .from(templateMilestones)
    .where(eq(templateMilestones.templateId, templateId))
    .orderBy(asc(templateMilestones.order));

  if (flatMilestones.length === 0) return;

  await db.insert(milestones).values(
    flatMilestones.map((tm) => ({
      projectId,
      title: tm.title,
      category: tm.category,
      status: 'pending' as const,
      order: tm.order,
    })),
  );
}
