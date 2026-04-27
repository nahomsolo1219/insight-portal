'use server';

import { and, asc, count, eq, inArray } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import {
  clients,
  milestones,
  projectAssignments,
  projectTemplates,
  projects,
  properties,
  templateMilestones,
  templatePhases,
} from '@/db/schema';
import { logAudit } from '@/lib/audit';
import { requireAdmin } from '@/lib/auth/current-user';
import { createAdminClient } from '@/lib/supabase/admin';
import { avatarPath } from '@/lib/storage/paths';
import { getSignedUrl, uploadFile } from '@/lib/storage/upload';
import { getExtension, validateFile } from '@/lib/storage/validation';

type ActionResult<T = undefined> =
  | { success: true; data?: T }
  | { success: false; error: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Flip a milestone between `complete` and `pending`. After the toggle we
 * recompute the parent project's progress (completed / total) and write an
 * audit entry when the milestone is newly completed. `awaiting_client`
 * milestones are not toggled here — they resolve via the decision flow.
 */
export async function toggleMilestoneComplete(
  milestoneId: string,
  clientId: string,
): Promise<ActionResult> {
  const user = await requireAdmin();

  try {
    const [existing] = await db
      .select({
        id: milestones.id,
        title: milestones.title,
        status: milestones.status,
        projectId: milestones.projectId,
      })
      .from(milestones)
      .where(eq(milestones.id, milestoneId))
      .limit(1);

    if (!existing) return { success: false, error: 'Milestone not found' };

    if (existing.status === 'awaiting_client') {
      return {
        success: false,
        error: 'This milestone is waiting on the client — resolve the decision instead.',
      };
    }

    const newStatus = existing.status === 'complete' ? 'pending' : 'complete';

    await db
      .update(milestones)
      .set({ status: newStatus, updatedAt: new Date() })
      .where(eq(milestones.id, milestoneId));

    // Recalculate project progress in a single SQL round-trip.
    const [totalRow] = await db
      .select({ count: count() })
      .from(milestones)
      .where(eq(milestones.projectId, existing.projectId));
    const [doneRow] = await db
      .select({ count: count() })
      .from(milestones)
      .where(and(eq(milestones.projectId, existing.projectId), eq(milestones.status, 'complete')));

    const total = Number(totalRow?.count ?? 0);
    const done = Number(doneRow?.count ?? 0);
    const progress = total === 0 ? 0 : Math.round((done / total) * 100);

    await db
      .update(projects)
      .set({ progress, updatedAt: new Date() })
      .where(eq(projects.id, existing.projectId));

    if (newStatus === 'complete') {
      await logAudit({
        actor: user,
        action: 'marked milestone complete',
        targetType: 'milestone',
        targetId: existing.id,
        targetLabel: existing.title,
        clientId,
      });
    }

    revalidatePath(`/admin/clients/${clientId}`);
    revalidatePath('/admin');
    return { success: true };
  } catch (error) {
    console.error('[toggleMilestoneComplete]', error);
    return { success: false, error: 'Failed to update milestone' };
  }
}

// ---------------------------------------------------------------------------
// Client + property edit actions (Profile tab)
// ---------------------------------------------------------------------------

export interface UpdateClientInput {
  name: string;
  email?: string | null;
  phone?: string | null;
  membershipTierId?: string | null;
  assignedPmId?: string | null;
  memberSince?: string | null;
}

/**
 * Update client contact + assignment info. Mirrors the validation rules
 * `createClient` uses — name required, optional email must parse. Empty
 * strings become NULL so `IS NULL` queries and mailto:/tel: guards work.
 */
export async function updateClient(
  clientId: string,
  input: UpdateClientInput,
): Promise<ActionResult> {
  const user = await requireAdmin();

  const name = input.name?.trim() ?? '';
  if (!name) return { success: false, error: 'Client name is required' };
  if (name.length > 200) return { success: false, error: 'Client name is too long' };
  if (input.email && !EMAIL_RE.test(input.email.trim())) {
    return { success: false, error: 'Invalid email address' };
  }

  try {
    const [updated] = await db
      .update(clients)
      .set({
        name,
        email: input.email?.trim() || null,
        phone: input.phone?.trim() || null,
        membershipTierId: input.membershipTierId || null,
        assignedPmId: input.assignedPmId || null,
        memberSince: input.memberSince || null,
        updatedAt: new Date(),
      })
      .where(eq(clients.id, clientId))
      .returning({ id: clients.id, name: clients.name });

    if (!updated) return { success: false, error: 'Client not found' };

    await logAudit({
      actor: user,
      action: 'updated client',
      targetType: 'client',
      targetId: updated.id,
      targetLabel: updated.name,
      clientId: updated.id,
    });

    revalidatePath(`/admin/clients/${clientId}`);
    revalidatePath('/admin/clients');
    revalidatePath('/admin');
    return { success: true };
  } catch (error) {
    console.error('[updateClient]', error);
    return { success: false, error: 'Failed to update client' };
  }
}

export type PropertyStatusTone = 'green' | 'amber' | 'neutral' | 'rose';

export interface UpdatePropertyInput {
  name: string;
  address: string;
  city: string;
  state: string;
  zipcode?: string | null;
  sqft?: number | null;
  yearBuilt?: number | null;
  bedrooms?: number | null;
  /** Pass as a string ("2.5") or number — we normalise to a numeric DB string. */
  bathrooms?: string | number | null;
  region?: string | null;
  statusLabel?: string | null;
  statusTone?: PropertyStatusTone | null;
  gateCode?: string | null;
  accessNotes?: string | null;
  emergencyContact?: string | null;
}

/**
 * Update property details. `clientId` is required so we can revalidate the
 * owning client page — it's never written to the property row itself (the
 * FK is the source of truth).
 */
export async function updateProperty(
  propertyId: string,
  clientId: string,
  input: UpdatePropertyInput,
): Promise<ActionResult> {
  const user = await requireAdmin();

  const name = input.name?.trim() ?? '';
  const address = input.address?.trim() ?? '';
  const city = input.city?.trim() ?? '';
  const state = input.state?.trim() ?? '';

  if (!name) return { success: false, error: 'Property name is required' };
  if (!address) return { success: false, error: 'Address is required' };
  if (!city) return { success: false, error: 'City is required' };
  if (!state) return { success: false, error: 'State is required' };

  try {
    const [updated] = await db
      .update(properties)
      .set({
        name,
        address,
        city,
        state,
        zipcode: input.zipcode?.trim() || null,
        sqft: input.sqft ?? null,
        yearBuilt: input.yearBuilt ?? null,
        bedrooms: input.bedrooms ?? null,
        bathrooms: normaliseBathrooms(input.bathrooms),
        region: input.region?.trim() || null,
        statusLabel: input.statusLabel?.trim() || null,
        statusTone: input.statusLabel?.trim() ? (input.statusTone ?? null) : null,
        gateCode: input.gateCode?.trim() || null,
        accessNotes: input.accessNotes?.trim() || null,
        emergencyContact: input.emergencyContact?.trim() || null,
        updatedAt: new Date(),
      })
      .where(eq(properties.id, propertyId))
      .returning({ id: properties.id, name: properties.name });

    if (!updated) return { success: false, error: 'Property not found' };

    await logAudit({
      actor: user,
      action: 'updated property',
      targetType: 'property',
      targetId: updated.id,
      targetLabel: updated.name,
      clientId,
    });

    revalidatePath(`/admin/clients/${clientId}`);
    revalidatePath('/admin');
    return { success: true };
  } catch (error) {
    console.error('[updateProperty]', error);
    return { success: false, error: 'Failed to update property' };
  }
}

// ---------------------------------------------------------------------------
// Property + project creation
// ---------------------------------------------------------------------------

export interface CreatePropertyInput {
  name: string;
  address: string;
  city: string;
  state: string;
  zipcode?: string | null;
  sqft?: number | null;
  yearBuilt?: number | null;
  bedrooms?: number | null;
  bathrooms?: string | number | null;
  region?: string | null;
  statusLabel?: string | null;
  statusTone?: PropertyStatusTone | null;
  gateCode?: string | null;
  emergencyContact?: string | null;
  accessNotes?: string | null;
}

/**
 * Create a property under an existing client. State is normalised to upper-
 * case ("CA", not "ca") so list views read consistently. Empty optional
 * strings collapse to NULL rather than '' so `IS NULL` queries work.
 */
export async function createProperty(
  clientId: string,
  input: CreatePropertyInput,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireAdmin();

  const name = input.name?.trim() ?? '';
  const address = input.address?.trim() ?? '';
  const city = input.city?.trim() ?? '';
  const state = input.state?.trim() ?? '';

  if (!name) return { success: false, error: 'Property name is required' };
  if (!address) return { success: false, error: 'Address is required' };
  if (!city) return { success: false, error: 'City is required' };
  if (!state) return { success: false, error: 'State is required' };

  try {
    const [property] = await db
      .insert(properties)
      .values({
        clientId,
        name,
        address,
        city,
        state: state.toUpperCase(),
        zipcode: input.zipcode?.trim() || null,
        sqft: input.sqft ?? null,
        yearBuilt: input.yearBuilt ?? null,
        bedrooms: input.bedrooms ?? null,
        bathrooms: normaliseBathrooms(input.bathrooms),
        region: input.region?.trim() || null,
        statusLabel: input.statusLabel?.trim() || null,
        statusTone: input.statusLabel?.trim() ? (input.statusTone ?? null) : null,
        gateCode: input.gateCode?.trim() || null,
        emergencyContact: input.emergencyContact?.trim() || null,
        accessNotes: input.accessNotes?.trim() || null,
      })
      .returning({ id: properties.id, name: properties.name });

    await logAudit({
      actor: user,
      action: 'created property',
      targetType: 'property',
      targetId: property.id,
      targetLabel: property.name,
      clientId,
    });

    revalidatePath(`/admin/clients/${clientId}`);
    revalidatePath('/admin');
    return { success: true, data: { id: property.id } };
  } catch (error) {
    console.error('[createProperty]', error);
    return { success: false, error: 'Failed to create property' };
  }
}

/**
 * Drizzle's `numeric` column type expects a string. Accept either a number
 * or a string from the form payload, reject anything that doesn't parse to
 * a finite non-negative number, and round to one decimal so half-baths
 * (2.5) survive but 2.53 doesn't sneak in.
 */
function normaliseBathrooms(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return (Math.round(parsed * 10) / 10).toFixed(1);
}

/**
 * Delete a property and everything underneath it. The DB cascade chain
 * walks property → projects → milestones / appointments / photos /
 * documents / reports, so a single DELETE wipes the whole subtree.
 *
 * Two safeguards before the DELETE runs:
 * 1. The property must belong to the claimed client (forged URL guard).
 * 2. The caller must echo the property's name verbatim (case-insensitive)
 *    to confirm — same pattern used by GitHub's repo-delete dialog. This
 *    is the only destructive admin action with no undo, so it's worth
 *    the extra typing.
 */
export async function deleteProperty(
  propertyId: string,
  clientId: string,
  confirmName: string,
): Promise<ActionResult> {
  const user = await requireAdmin();

  try {
    const [property] = await db
      .select({
        id: properties.id,
        name: properties.name,
        clientId: properties.clientId,
      })
      .from(properties)
      .where(eq(properties.id, propertyId))
      .limit(1);

    if (!property) return { success: false, error: 'Property not found' };
    if (property.clientId !== clientId) {
      return { success: false, error: 'Property does not belong to this client' };
    }
    if (
      confirmName.trim().toLowerCase() !== property.name.trim().toLowerCase()
    ) {
      return {
        success: false,
        error: 'Property name does not match. Type the exact name to confirm.',
      };
    }

    await db.delete(properties).where(eq(properties.id, propertyId));

    await logAudit({
      actor: user,
      action: 'deleted property',
      targetType: 'property',
      targetId: property.id,
      targetLabel: property.name,
      clientId,
    });

    revalidatePath(`/admin/clients/${clientId}`);
    revalidatePath('/admin');
    return { success: true };
  } catch (error) {
    console.error('[deleteProperty]', error);
    return { success: false, error: 'Failed to delete property' };
  }
}

export interface CreateProjectInput {
  propertyId: string;
  name: string;
  type: 'maintenance' | 'remodel';
  /** YYYY-MM-DD */
  startDate: string;
  /** YYYY-MM-DD */
  endDate?: string | null;
  description?: string | null;
  contractCents?: number | null;
  templateId?: string | null;
  /** Optional: profile ids of field staff to assign at create time. */
  assignedStaffIds?: string[];
}

/**
 * Create a project on a property and (optionally) seed it with milestones
 * copied from a template. Property ownership is verified explicitly: a
 * forged `propertyId` belonging to another client gets rejected before the
 * insert. RLS would also block it, but the explicit error message is
 * better UX than a 500.
 */
export async function createProject(
  clientId: string,
  input: CreateProjectInput,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireAdmin();

  const name = input.name?.trim() ?? '';
  if (!name) return { success: false, error: 'Project name is required' };
  if (!input.propertyId) return { success: false, error: 'Property is required' };
  if (!input.startDate) return { success: false, error: 'Start date is required' };

  // Ownership check — `propertyId` came from the client, so we re-verify
  // it belongs to this client before writing.
  const [property] = await db
    .select({ id: properties.id, clientId: properties.clientId })
    .from(properties)
    .where(eq(properties.id, input.propertyId))
    .limit(1);

  if (!property || property.clientId !== clientId) {
    return { success: false, error: 'Property not found for this client' };
  }

  try {
    const [project] = await db
      .insert(projects)
      .values({
        propertyId: input.propertyId,
        name,
        type: input.type,
        status: 'active',
        startDate: input.startDate,
        endDate: input.endDate || null,
        progress: 0,
        description: input.description?.trim() || null,
        contractCents: input.contractCents ?? null,
        changesCents: 0,
        paidCents: 0,
      })
      .returning({ id: projects.id, name: projects.name });

    if (input.templateId) {
      await applyTemplateToProject(project.id, input.templateId);
    }

    // Best-effort initial assignments. The Team tab on the project
    // detail page is the recoverable home for this — a failed insert
    // here just means the admin re-adds the missing staff there. We
    // dedupe by Set in case the form somehow submitted the same id
    // twice; the composite PK would also stop the dup at write time.
    if (input.assignedStaffIds?.length) {
      const uniqueIds = Array.from(new Set(input.assignedStaffIds));
      try {
        await db
          .insert(projectAssignments)
          .values(uniqueIds.map((userId) => ({ projectId: project.id, userId })))
          .onConflictDoNothing();
      } catch (assignErr) {
        console.error(
          '[createProject] initial assignments failed (project still created):',
          assignErr,
        );
      }
    }

    await logAudit({
      actor: user,
      action: 'created project',
      targetType: 'project',
      targetId: project.id,
      targetLabel: project.name,
      clientId,
    });

    revalidatePath(`/admin/clients/${clientId}`);
    revalidatePath('/admin');
    return { success: true, data: { id: project.id } };
  } catch (error) {
    console.error('[createProject]', error);
    return { success: false, error: 'Failed to create project' };
  }
}

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
async function applyTemplateToProject(projectId: string, templateId: string) {
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
        // Empty phase — still surface it on the project so the timeline
        // shows the structure David designed in the template.
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
          // jsonb passes through whatever the template stored — rich object
          // shape from S3 or the legacy string[] both serialise fine.
          options: tm.isDecisionPoint ? tm.decisionOptions : null,
        });
      }
    }

    if (inserts.length > 0) await db.insert(milestones).values(inserts);
    return;
  }

  // Legacy flat template — milestones hang directly off the template, no
  // phase grouping, no decision points.
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

// ---------------------------------------------------------------------------
// Avatar upload
// ---------------------------------------------------------------------------

interface UploadAvatarSuccess {
  success: true;
  /** Fresh signed URL the caller can render immediately. */
  url: string;
}
type UploadAvatarResult = UploadAvatarSuccess | { success: false; error: string };

const AVATAR_MAX_SIZE = 5 * 1024 * 1024; // 5 MB

/**
 * Upload (or replace) a client's avatar. Path layout matches the existing
 * client storage RLS so the portal can sign + render without any new
 * grants. We use `upsert: true` because the path is deterministic per
 * client — re-uploading should overwrite, not stack.
 *
 * Returns a fresh signed URL so the caller can swap in the new image
 * without an extra fetch round-trip.
 */
export async function uploadClientAvatar(
  clientId: string,
  formData: FormData,
): Promise<UploadAvatarResult> {
  const user = await requireAdmin();

  const file = formData.get('avatar');
  if (!(file instanceof File) || file.size === 0) {
    return { success: false, error: 'No image selected.' };
  }

  const validation = validateFile(file, 'image', AVATAR_MAX_SIZE);
  if (!validation.ok) return { success: false, error: validation.error };

  const ext = getExtension(file.name) || 'jpg';
  const path = avatarPath('client', clientId, ext);

  const result = await uploadFile({
    path,
    file,
    contentType: file.type || 'image/jpeg',
    upsert: true,
  });
  if ('error' in result) return { success: false, error: result.error };

  await db
    .update(clients)
    .set({ avatarStoragePath: result.path, updatedAt: new Date() })
    .where(eq(clients.id, clientId));

  await logAudit({
    actor: user,
    action: 'updated client',
    targetType: 'client',
    targetId: clientId,
    targetLabel: 'avatar',
    clientId,
    metadata: { field: 'avatar' },
  });

  const signedUrl = await getSignedUrl(result.path);

  revalidatePath(`/admin/clients/${clientId}`);
  revalidatePath('/admin/clients');
  return { success: true, url: signedUrl ?? '' };
}

// ---------------------------------------------------------------------------
// Property cover photos (Phase 1 of the client portal redesign)
// ---------------------------------------------------------------------------

const COVER_BUCKET = 'property-covers';
const COVER_MAX_BYTES = 8 * 1024 * 1024;


/**
 * Pull the file extension off a filename. Falls back to a sensible
 * default if the filename has no dot — happens with mobile-camera
 * uploads on certain Android browsers that strip extensions.
 */
function pickCoverExtension(file: File): string {
  const fromName = file.name.includes('.')
    ? file.name.split('.').pop()!.toLowerCase().slice(0, 5)
    : '';
  if (fromName && /^[a-z0-9]+$/.test(fromName)) return fromName;
  // Fall back to MIME — `image/jpeg` → `jpeg`, `image/webp` → `webp`.
  const mimeExt = file.type.split('/')[1];
  return mimeExt && /^[a-z0-9]+$/.test(mimeExt) ? mimeExt : 'jpg';
}

export async function uploadPropertyCoverPhoto(
  propertyId: string,
  formData: FormData,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const user = await requireAdmin();

  const [property] = await db
    .select({
      id: properties.id,
      name: properties.name,
      clientId: properties.clientId,
    })
    .from(properties)
    .where(eq(properties.id, propertyId))
    .limit(1);
  if (!property) return { ok: false, error: 'Property not found.' };

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: 'No file selected.' };
  }
  if (!file.type.startsWith('image/')) {
    return { ok: false, error: 'Cover photo must be an image.' };
  }
  if (file.size > COVER_MAX_BYTES) {
    return { ok: false, error: 'Cover photo must be 8 MB or smaller.' };
  }

  const ext = pickCoverExtension(file);
  const path = `${propertyId}.${ext}`;
  const supabase = createAdminClient();

  // Overwrite-on-conflict so admin replacing a cover never accumulates
  // stale objects under different extensions. The cache-bust query
  // string on the read path picks up the new file.
  const { error: uploadError } = await supabase.storage
    .from(COVER_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: true });
  if (uploadError) {
    console.error('[uploadPropertyCoverPhoto] upload failed', uploadError);
    return { ok: false, error: 'Failed to upload cover photo.' };
  }

  // If admin previously uploaded with a *different* extension (e.g.
  // .jpg → .png), the old object is now an orphan at the old path.
  // Clean it up if the URL on file points at a different extension.
  if (property /* always truthy here, kept for null-safety */) {
    // Read the prior URL so we can detect and delete the stale object.
    const [prior] = await db
      .select({ coverPhotoUrl: properties.coverPhotoUrl })
      .from(properties)
      .where(eq(properties.id, propertyId))
      .limit(1);
    if (prior?.coverPhotoUrl) {
      const priorPath = prior.coverPhotoUrl.split('/').pop()?.split('?')[0];
      if (priorPath && priorPath !== `${propertyId}.${ext}`) {
        await supabase.storage
          .from(COVER_BUCKET)
          .remove([priorPath])
          .catch((err: unknown) =>
            console.error('[uploadPropertyCoverPhoto] orphan cleanup failed', err),
          );
      }
    }
  }

  const { data: urlData } = supabase.storage.from(COVER_BUCKET).getPublicUrl(path);
  const url = urlData.publicUrl;

  const now = new Date();
  await db
    .update(properties)
    .set({
      coverPhotoUrl: url,
      coverPhotoUploadedAt: now,
      coverPhotoUploadedBy: user.id,
      updatedAt: now,
    })
    .where(eq(properties.id, propertyId));

  await logAudit({
    actor: user,
    action: 'uploaded property cover photo',
    targetType: 'property',
    targetId: propertyId,
    targetLabel: property.name,
    clientId: property.clientId,
  });

  revalidatePath(`/admin/clients/${property.clientId}`);
  return { ok: true, url };
}

export async function removePropertyCoverPhoto(
  propertyId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireAdmin();

  const [property] = await db
    .select({
      id: properties.id,
      name: properties.name,
      clientId: properties.clientId,
      coverPhotoUrl: properties.coverPhotoUrl,
    })
    .from(properties)
    .where(eq(properties.id, propertyId))
    .limit(1);
  if (!property) return { ok: false, error: 'Property not found.' };

  // Best-effort storage delete — if the file is already gone (manual
  // removal, prior failed upload), still null out the row so the UI
  // and downstream consumers stop showing a broken cover.
  if (property.coverPhotoUrl) {
    const priorPath = property.coverPhotoUrl.split('/').pop()?.split('?')[0];
    if (priorPath) {
      const supabase = createAdminClient();
      await supabase.storage
        .from(COVER_BUCKET)
        .remove([priorPath])
        .catch((err: unknown) =>
          console.error('[removePropertyCoverPhoto] storage delete failed', err),
        );
    }
  }

  const now = new Date();
  await db
    .update(properties)
    .set({
      coverPhotoUrl: null,
      coverPhotoUploadedAt: null,
      coverPhotoUploadedBy: null,
      updatedAt: now,
    })
    .where(eq(properties.id, propertyId));

  await logAudit({
    actor: user,
    action: 'removed property cover photo',
    targetType: 'property',
    targetId: propertyId,
    targetLabel: property.name,
    clientId: property.clientId,
  });

  revalidatePath(`/admin/clients/${property.clientId}`);
  return { ok: true };
}
