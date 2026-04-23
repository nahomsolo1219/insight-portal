'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { projectTemplates, templateMilestones } from '@/db/schema';
import { logAudit } from '@/lib/audit';
import { requireAdmin } from '@/lib/auth/current-user';

type ActionResult<T = undefined> =
  | { success: true; data?: T }
  | { success: false; error: string };

export type ProjectTemplateType = 'maintenance' | 'remodel';

export interface TemplateMilestoneInput {
  title: string;
  category?: string | null;
  offset?: string | null;
  order: number;
}

export interface TemplateInput {
  name: string;
  type: ProjectTemplateType;
  description?: string | null;
  duration?: string | null;
  milestones: TemplateMilestoneInput[];
}

function normaliseMilestones(
  milestones: TemplateMilestoneInput[],
): TemplateMilestoneInput[] {
  // Trim, drop empty titles, and renumber order 1..N so stored rows are
  // always well-formed regardless of what the client sent.
  return milestones
    .map((m) => ({
      title: m.title.trim(),
      category: m.category?.trim() || null,
      offset: m.offset?.trim() || null,
      order: m.order,
    }))
    .filter((m) => m.title.length > 0)
    .sort((a, b) => a.order - b.order)
    .map((m, i) => ({ ...m, order: i + 1 }));
}

export async function createTemplate(
  input: TemplateInput,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireAdmin();

  if (!input.name?.trim()) return { success: false, error: 'Template name is required.' };
  const milestones = normaliseMilestones(input.milestones);
  if (milestones.length === 0) {
    return { success: false, error: 'Add at least one milestone with a title.' };
  }

  try {
    const [template] = await db
      .insert(projectTemplates)
      .values({
        name: input.name.trim(),
        type: input.type,
        description: input.description?.trim() || null,
        duration: input.duration?.trim() || null,
      })
      .returning({ id: projectTemplates.id, name: projectTemplates.name });

    await db.insert(templateMilestones).values(
      milestones.map((m) => ({
        templateId: template.id,
        title: m.title,
        category: m.category,
        offset: m.offset,
        order: m.order,
      })),
    );

    await logAudit({
      actor: user,
      action: 'created template',
      targetType: 'template',
      targetId: template.id,
      targetLabel: template.name,
      metadata: { type: input.type, milestoneCount: milestones.length },
    });

    revalidatePath('/admin/templates');
    return { success: true, data: { id: template.id } };
  } catch (error) {
    console.error('[createTemplate]', error);
    return { success: false, error: 'Failed to create template.' };
  }
}

/**
 * Update a template + replace its milestones. We delete-and-reinsert
 * rather than diffing — with <20 milestones per template, the simpler
 * approach is easier to reason about and reliable.
 */
export async function updateTemplate(
  templateId: string,
  input: TemplateInput,
): Promise<ActionResult> {
  const user = await requireAdmin();

  if (!input.name?.trim()) return { success: false, error: 'Template name is required.' };
  const milestones = normaliseMilestones(input.milestones);
  if (milestones.length === 0) {
    return { success: false, error: 'Add at least one milestone with a title.' };
  }

  try {
    const [updated] = await db
      .update(projectTemplates)
      .set({
        name: input.name.trim(),
        type: input.type,
        description: input.description?.trim() || null,
        duration: input.duration?.trim() || null,
      })
      .where(eq(projectTemplates.id, templateId))
      .returning({ id: projectTemplates.id, name: projectTemplates.name });

    if (!updated) return { success: false, error: 'Template not found.' };

    await db.delete(templateMilestones).where(eq(templateMilestones.templateId, templateId));
    await db.insert(templateMilestones).values(
      milestones.map((m) => ({
        templateId,
        title: m.title,
        category: m.category,
        offset: m.offset,
        order: m.order,
      })),
    );

    await logAudit({
      actor: user,
      action: 'updated template',
      targetType: 'template',
      targetId: updated.id,
      targetLabel: updated.name,
      metadata: { milestoneCount: milestones.length },
    });

    revalidatePath('/admin/templates');
    return { success: true };
  } catch (error) {
    console.error('[updateTemplate]', error);
    return { success: false, error: 'Failed to update template.' };
  }
}

/**
 * Hard-delete a template. `template_milestones.template_id` has
 * `onDelete: 'cascade'` so those rows go with it. Existing projects that
 * were spawned from this template keep their own milestones — the FK is
 * one-way (project → milestones are copies, not references).
 */
export async function deleteTemplate(templateId: string): Promise<ActionResult> {
  const user = await requireAdmin();

  try {
    const [template] = await db
      .select({ id: projectTemplates.id, name: projectTemplates.name })
      .from(projectTemplates)
      .where(eq(projectTemplates.id, templateId))
      .limit(1);

    if (!template) return { success: false, error: 'Template not found.' };

    await db.delete(projectTemplates).where(eq(projectTemplates.id, templateId));

    await logAudit({
      actor: user,
      action: 'deleted template',
      targetType: 'template',
      targetId: template.id,
      targetLabel: template.name,
    });

    revalidatePath('/admin/templates');
    return { success: true };
  } catch (error) {
    console.error('[deleteTemplate]', error);
    return { success: false, error: 'Failed to delete template.' };
  }
}
