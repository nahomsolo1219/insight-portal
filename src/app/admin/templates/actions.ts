'use server';

import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import {
  projectTemplates,
  templateMilestones,
  templatePhaseDependencies,
  templatePhases,
} from '@/db/schema';
import { logAudit } from '@/lib/audit';
import { requireAdmin } from '@/lib/auth/current-user';
import { decisionOptionImagePath } from '@/lib/storage/paths';
import { createAdminClient } from '@/lib/supabase/admin';
import { deleteFile, getSignedUrlAdmin, uploadFile } from '@/lib/storage/upload';
import { getExtension, validateFile } from '@/lib/storage/validation';

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

// ---------------------------------------------------------------------------
// Phase-based (visual-builder) template create / update
// ---------------------------------------------------------------------------

type DecisionType = 'single' | 'multi' | 'approval' | 'open' | 'acknowledge';
type PhotoDocumentation =
  | 'none'
  | 'before_after'
  | 'before_during_after'
  | 'during_only';

/**
 * Persisted shape of a decision option. The transient `imageUrl` (signed
 * URL) is intentionally absent — we sign at load time, never write to DB.
 */
export interface DecisionOptionInput {
  label: string;
  imageStoragePath?: string | null;
  description?: string | null;
}

export interface PhaseMilestoneInput {
  title: string;
  category: string;
  order: number;
  description?: string | null;
  isDecisionPoint?: boolean;
  decisionQuestion?: string | null;
  decisionType?: DecisionType | null;
  /** Stored as jsonb. Null or omitted for non-choice decision types. */
  decisionOptions?: DecisionOptionInput[] | null;
}

export interface PhaseInput {
  title: string;
  description?: string | null;
  order: number;
  estimatedDuration?: string | null;
  estimatedDays?: number | null;
  photoDocumentation?: PhotoDocumentation;
  /** Indexes into the phases array this phase depends on (resolved to IDs after insert). */
  dependsOnPhaseIndices?: number[];
  milestones: PhaseMilestoneInput[];
}

export interface PhaseTemplateInput {
  name: string;
  type: ProjectTemplateType;
  description?: string | null;
  duration?: string | null;
  phases: PhaseInput[];
}

/**
 * Validate phase input and surface a user-facing error on the first problem
 * found. Returns null on success. Keeps the two action handlers (create /
 * update) from duplicating identical checks.
 */
function validatePhaseInput(input: PhaseTemplateInput): string | null {
  if (!input.name?.trim()) return 'Template name is required.';
  if (input.phases.length === 0) return 'Add at least one phase.';
  for (const [i, phase] of input.phases.entries()) {
    if (!phase.title?.trim()) return `Phase ${i + 1} needs a title.`;
    const deps = phase.dependsOnPhaseIndices;
    if (deps) {
      const seen = new Set<number>();
      for (const idx of deps) {
        if (idx < 0 || idx >= input.phases.length) {
          return `Phase "${phase.title}" has an invalid dependency.`;
        }
        if (idx === i) {
          return `Phase "${phase.title}" can't depend on itself.`;
        }
        if (seen.has(idx)) {
          return `Phase "${phase.title}" lists the same dependency twice.`;
        }
        seen.add(idx);
      }
    }
  }
  return null;
}

/**
 * Build the per-phase row sets from the user input. Pure — used by both
 * create and update so the two paths stay in sync. Order is re-derived from
 * array index so the caller doesn't need to supply it correctly.
 */
function buildPhaseRows(
  templateId: string,
  insertedPhaseIds: { id: string }[],
  input: PhaseTemplateInput,
) {
  const dependencyRows: { phaseId: string; dependsOnPhaseId: string }[] = [];
  const milestoneRows: (typeof templateMilestones.$inferInsert)[] = [];

  for (let i = 0; i < input.phases.length; i++) {
    const phase = input.phases[i];
    const phaseId = insertedPhaseIds[i].id;

    const deps = phase.dependsOnPhaseIndices;
    if (deps) {
      for (const depIndex of deps) {
        dependencyRows.push({
          phaseId,
          dependsOnPhaseId: insertedPhaseIds[depIndex].id,
        });
      }
    }

    for (let j = 0; j < phase.milestones.length; j++) {
      const m = phase.milestones[j];
      if (!m.title?.trim()) continue; // drop empties the way the legacy flow does
      milestoneRows.push({
        templateId,
        phaseId,
        title: m.title.trim(),
        category: m.category?.trim() || null,
        // Phase-based milestones have a real phaseId FK — we deliberately
        // leave the legacy free-text `offset` null rather than repurposing
        // it as "Phase N" (which would be redundant and misleading).
        offset: null,
        order: m.order ?? j + 1,
        description: m.description?.trim() || null,
        isDecisionPoint: m.isDecisionPoint ?? false,
        decisionQuestion: m.decisionQuestion?.trim() || null,
        decisionType: m.decisionType ?? null,
        // Normalize to the persisted shape — strip any client-side fields
        // (e.g. transient `imageUrl`) and coerce missing keys to null so
        // the jsonb stays canonical.
        decisionOptions:
          m.decisionOptions && m.decisionOptions.length > 0
            ? m.decisionOptions.map((opt) => ({
                label: opt.label,
                imageStoragePath: opt.imageStoragePath ?? null,
                description: opt.description ?? null,
              }))
            : null,
      });
    }
  }

  return { dependencyRows, milestoneRows };
}

export async function createPhaseTemplate(
  input: PhaseTemplateInput,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireAdmin();

  const validationError = validatePhaseInput(input);
  if (validationError) return { success: false, error: validationError };

  try {
    const [template] = await db
      .insert(projectTemplates)
      .values({
        name: input.name.trim(),
        type: input.type,
        description: input.description?.trim() || null,
        duration: input.duration?.trim() || null,
        usesPhases: true,
      })
      .returning({ id: projectTemplates.id, name: projectTemplates.name });

    const phaseInserts = input.phases.map((p, i) => ({
      templateId: template.id,
      title: p.title.trim(),
      description: p.description?.trim() || null,
      order: p.order ?? i + 1,
      estimatedDuration: p.estimatedDuration?.trim() || null,
      estimatedDays: p.estimatedDays ?? null,
      photoDocumentation: p.photoDocumentation ?? 'before_during_after',
    }));
    const insertedPhases = await db
      .insert(templatePhases)
      .values(phaseInserts)
      .returning({ id: templatePhases.id });

    const { dependencyRows, milestoneRows } = buildPhaseRows(
      template.id,
      insertedPhases,
      input,
    );

    if (dependencyRows.length > 0) {
      await db.insert(templatePhaseDependencies).values(dependencyRows);
    }
    if (milestoneRows.length > 0) {
      await db.insert(templateMilestones).values(milestoneRows);
    }

    await logAudit({
      actor: user,
      action: 'created template',
      targetType: 'template',
      targetId: template.id,
      targetLabel: template.name,
      metadata: {
        type: input.type,
        phaseCount: input.phases.length,
        milestoneCount: milestoneRows.length,
      },
    });

    revalidatePath('/admin/templates');
    return { success: true, data: { id: template.id } };
  } catch (error) {
    console.error('[createPhaseTemplate]', error);
    return { success: false, error: 'Failed to create template.' };
  }
}

/**
 * Update a phase-based template. Same delete-and-reinsert pattern the legacy
 * `updateTemplate` uses — cascades wipe phases + their dependencies + their
 * milestones in one go; we then rebuild the tree from the new input. Legacy
 * orphan milestones (if this template was ever flat) are purged too so a
 * template that transitions from flat → phases doesn't carry stragglers.
 */
export async function updatePhaseTemplate(
  templateId: string,
  input: PhaseTemplateInput,
): Promise<ActionResult> {
  const user = await requireAdmin();

  const validationError = validatePhaseInput(input);
  if (validationError) return { success: false, error: validationError };

  try {
    const [updated] = await db
      .update(projectTemplates)
      .set({
        name: input.name.trim(),
        type: input.type,
        description: input.description?.trim() || null,
        duration: input.duration?.trim() || null,
        usesPhases: true,
      })
      .where(eq(projectTemplates.id, templateId))
      .returning({ id: projectTemplates.id, name: projectTemplates.name });

    if (!updated) return { success: false, error: 'Template not found.' };

    // Cascade via template_phases drops milestones (phase-attached) and
    // dependencies. Then sweep any legacy phase-less milestones that remain.
    await db.delete(templatePhases).where(eq(templatePhases.templateId, templateId));
    await db.delete(templateMilestones).where(eq(templateMilestones.templateId, templateId));

    const phaseInserts = input.phases.map((p, i) => ({
      templateId,
      title: p.title.trim(),
      description: p.description?.trim() || null,
      order: p.order ?? i + 1,
      estimatedDuration: p.estimatedDuration?.trim() || null,
      estimatedDays: p.estimatedDays ?? null,
      photoDocumentation: p.photoDocumentation ?? 'before_during_after',
    }));
    const insertedPhases = await db
      .insert(templatePhases)
      .values(phaseInserts)
      .returning({ id: templatePhases.id });

    const { dependencyRows, milestoneRows } = buildPhaseRows(
      templateId,
      insertedPhases,
      input,
    );

    if (dependencyRows.length > 0) {
      await db.insert(templatePhaseDependencies).values(dependencyRows);
    }
    if (milestoneRows.length > 0) {
      await db.insert(templateMilestones).values(milestoneRows);
    }

    await logAudit({
      actor: user,
      action: 'updated template',
      targetType: 'template',
      targetId: updated.id,
      targetLabel: updated.name,
      metadata: {
        phaseCount: input.phases.length,
        milestoneCount: milestoneRows.length,
      },
    });

    revalidatePath('/admin/templates');
    return { success: true };
  } catch (error) {
    console.error('[updatePhaseTemplate]', error);
    return { success: false, error: 'Failed to update template.' };
  }
}

// ---------------------------------------------------------------------------
// Decision-option image upload / delete
// ---------------------------------------------------------------------------

interface UploadDecisionImageSuccess {
  success: true;
  path: string;
  signedUrl: string;
}
type UploadDecisionImageResult = UploadDecisionImageSuccess | { success: false; error: string };

/**
 * Upload a thumbnail for a decision-point option. The path is built
 * server-side from a fresh UUID so the client can't choose where bytes
 * land — that closes the door on a malicious admin client trying to
 * overwrite, say, an invoice PDF at `invoices/.../foo.pdf`.
 *
 * Returns both the storage path (persisted in the option's
 * `imageStoragePath`) and a fresh signed URL so the editor can render
 * the thumbnail immediately without an extra round-trip.
 */
export async function uploadDecisionOptionImage(
  formData: FormData,
): Promise<UploadDecisionImageResult> {
  await requireAdmin();

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { success: false, error: 'No file provided.' };
  }

  const validation = validateFile(file, 'image');
  if (!validation.ok) return { success: false, error: validation.error };

  const ext = getExtension(file.name) || 'jpg';
  const path = decisionOptionImagePath(randomUUID(), ext);

  const result = await uploadFile({
    path,
    file,
    contentType: file.type || 'image/jpeg',
  });
  if ('error' in result) return { success: false, error: result.error };

  const signedUrl = await getSignedUrlAdmin(result.path);
  return {
    success: true,
    path: result.path,
    signedUrl: signedUrl ?? '',
  };
}

/**
 * Delete an option image. We constrain the path prefix in addition to
 * `requireAdmin` so even a buggy client can't pass an arbitrary path and
 * wipe something it shouldn't.
 */
export async function deleteDecisionOptionImage(
  storagePath: string,
): Promise<ActionResult> {
  await requireAdmin();

  if (!storagePath.startsWith('decision-options/')) {
    return { success: false, error: 'Invalid image path.' };
  }

  const ok = await deleteFile(storagePath);
  if (!ok) return { success: false, error: 'Failed to delete image.' };
  return { success: true };
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

// ---------------------------------------------------------------------------
// Cover photo upload — same shape as `uploadPropertyCoverPhoto`, just
// scoped to the public `template-covers` bucket. Path stays stable on
// replace (overwrite-on-conflict); orphan cleanup runs when admin
// uploads a different extension than the prior file's path.
// ---------------------------------------------------------------------------

const TEMPLATE_COVER_BUCKET = 'template-covers';
const TEMPLATE_COVER_MAX_BYTES = 8 * 1024 * 1024;

/** Pick a normalised, lower-case extension. Falls back to MIME if the
 *  filename has none, then to `jpg` if that's also missing. */
function pickTemplateCoverExtension(file: File): string {
  const fromName = file.name.includes('.')
    ? file.name.split('.').pop()!.toLowerCase().slice(0, 5)
    : '';
  if (fromName && /^[a-z0-9]+$/.test(fromName)) return fromName;
  const mimeExt = file.type.split('/')[1];
  return mimeExt && /^[a-z0-9]+$/.test(mimeExt) ? mimeExt : 'jpg';
}

export async function uploadTemplateCoverPhoto(
  templateId: string,
  formData: FormData,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const user = await requireAdmin();

  const [template] = await db
    .select({
      id: projectTemplates.id,
      name: projectTemplates.name,
      coverStoragePath: projectTemplates.coverStoragePath,
    })
    .from(projectTemplates)
    .where(eq(projectTemplates.id, templateId))
    .limit(1);
  if (!template) return { ok: false, error: 'Template not found.' };

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: 'No file selected.' };
  }
  if (!file.type.startsWith('image/')) {
    return { ok: false, error: 'Cover photo must be an image.' };
  }
  if (file.size > TEMPLATE_COVER_MAX_BYTES) {
    return { ok: false, error: 'Cover photo must be 8 MB or smaller.' };
  }

  const ext = pickTemplateCoverExtension(file);
  const path = `${templateId}.${ext}`;
  const supabase = createAdminClient();

  // Overwrite-on-conflict so admin replacing a cover never accumulates
  // stale objects under different extensions. The cache-bust query
  // string on the read path picks up the new file.
  const { error: uploadError } = await supabase.storage
    .from(TEMPLATE_COVER_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: true });
  if (uploadError) {
    console.error('[uploadTemplateCoverPhoto] upload failed', uploadError);
    return { ok: false, error: 'Failed to upload cover photo.' };
  }

  // If the prior cover used a different extension (e.g. .jpg → .png),
  // the old object is now orphaned at the previous path. Clean up.
  if (template.coverStoragePath && template.coverStoragePath !== path) {
    await supabase.storage
      .from(TEMPLATE_COVER_BUCKET)
      .remove([template.coverStoragePath])
      .catch((err: unknown) =>
        console.error('[uploadTemplateCoverPhoto] orphan cleanup failed', err),
      );
  }

  const now = new Date();
  await db
    .update(projectTemplates)
    .set({
      coverStoragePath: path,
      coverUploadedAt: now,
      updatedAt: now,
    })
    .where(eq(projectTemplates.id, templateId));

  await logAudit({
    actor: user,
    action: 'uploaded template cover photo',
    targetType: 'template',
    targetId: templateId,
    targetLabel: template.name,
    clientId: null,
  });

  // The bucket is public; the URL is what the listing card needs to
  // render the new cover immediately on revalidate. Cache-busted via
  // `?v=` at the call site.
  const { data: urlData } = supabase.storage.from(TEMPLATE_COVER_BUCKET).getPublicUrl(path);
  revalidatePath('/admin/templates');
  return { ok: true, url: urlData.publicUrl };
}

export async function removeTemplateCoverPhoto(
  templateId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireAdmin();

  const [template] = await db
    .select({
      id: projectTemplates.id,
      name: projectTemplates.name,
      coverStoragePath: projectTemplates.coverStoragePath,
    })
    .from(projectTemplates)
    .where(eq(projectTemplates.id, templateId))
    .limit(1);
  if (!template) return { ok: false, error: 'Template not found.' };

  // Best-effort storage delete — if the file is already gone (manual
  // removal, prior failed upload), still null out the row so the UI
  // and downstream consumers stop showing a broken cover.
  if (template.coverStoragePath) {
    const supabase = createAdminClient();
    await supabase.storage
      .from(TEMPLATE_COVER_BUCKET)
      .remove([template.coverStoragePath])
      .catch((err: unknown) =>
        console.error('[removeTemplateCoverPhoto] storage delete failed', err),
      );
  }

  const now = new Date();
  await db
    .update(projectTemplates)
    .set({
      coverStoragePath: null,
      coverUploadedAt: null,
      updatedAt: now,
    })
    .where(eq(projectTemplates.id, templateId));

  await logAudit({
    actor: user,
    action: 'removed template cover photo',
    targetType: 'template',
    targetId: templateId,
    targetLabel: template.name,
    clientId: null,
  });

  revalidatePath('/admin/templates');
  return { ok: true };
}
