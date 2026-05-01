'use server';

import { and, desc, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import {
  milestones,
  profiles,
  projectAssignments,
  projects,
  properties,
  staff,
} from '@/db/schema';
import { logAudit } from '@/lib/audit';
import { requireAdmin } from '@/lib/auth/current-user';
import { createNotification } from '@/lib/notifications/create';
import { getClientRecipientUserIds } from '@/lib/notifications/recipients';

type ActionResult<T = undefined> =
  | { success: true; data?: T }
  | { success: false; error: string };

export type ProjectStatus = 'active' | 'completed' | 'on_hold';

export interface UpdateProjectInput {
  name?: string;
  type?: 'maintenance' | 'remodel';
  status?: ProjectStatus;
  startDate?: string | null;
  endDate?: string | null;
  description?: string | null;
  contractCents?: number | null;
  changesCents?: number | null;
  paidCents?: number | null;
}

export interface AddMilestoneInput {
  title: string;
  category?: string | null;
  dueDate?: string | null;
  notes?: string | null;
  vendorId?: string | null;
}

export interface UpdateMilestoneInput {
  title?: string;
  category?: string | null;
  dueDate?: string | null;
  notes?: string | null;
  vendorId?: string | null;
  status?: 'pending' | 'upcoming' | 'in_progress' | 'complete';
}

/**
 * Look up the project's owning client id (via property → client). Used
 * everywhere in this file for audit logging and revalidation.
 */
async function projectOwnership(
  projectId: string,
): Promise<{ name: string; clientId: string } | null> {
  const [row] = await db
    .select({
      name: projects.name,
      clientId: properties.clientId,
    })
    .from(projects)
    .innerJoin(properties, eq(properties.id, projects.propertyId))
    .where(eq(projects.id, projectId))
    .limit(1);
  return row ?? null;
}

/**
 * Recompute progress from the milestones row count. Mirrors what the
 * existing toggleMilestoneComplete does — we re-run it after add/delete
 * so the percentage doesn't drift when the denominator changes.
 */
async function recalcProgress(projectId: string): Promise<void> {
  const rows = await db
    .select({ status: milestones.status })
    .from(milestones)
    .where(eq(milestones.projectId, projectId));
  const total = rows.length;
  const completed = rows.filter((r) => r.status === 'complete').length;
  const progress = total === 0 ? 0 : Math.round((completed / total) * 100);
  await db.update(projects).set({ progress }).where(eq(projects.id, projectId));
}

// ---------------------------------------------------------------------------
// Project edit + delete
// ---------------------------------------------------------------------------

export async function updateProject(
  projectId: string,
  input: UpdateProjectInput,
): Promise<ActionResult> {
  const user = await requireAdmin();
  const owner = await projectOwnership(projectId);
  if (!owner) return { success: false, error: 'Project not found.' };

  if (input.name !== undefined && !input.name.trim()) {
    return { success: false, error: 'Project name cannot be empty.' };
  }
  if (input.contractCents !== undefined && input.contractCents !== null && input.contractCents < 0) {
    return { success: false, error: 'Contract amount cannot be negative.' };
  }
  if (input.paidCents !== undefined && input.paidCents !== null && input.paidCents < 0) {
    return { success: false, error: 'Paid amount cannot be negative.' };
  }

  // Drizzle's update set ignores undefined fields, but we want explicit
  // nulls (clearing a description, end date, etc.) to come through. So we
  // build the patch by hand from defined keys only.
  const patch: Record<string, unknown> = {};
  for (const key of [
    'name',
    'type',
    'status',
    'startDate',
    'endDate',
    'description',
    'contractCents',
    'changesCents',
    'paidCents',
  ] as const) {
    if (input[key] !== undefined) {
      patch[key] = key === 'name' ? (input.name ?? '').trim() : input[key];
    }
  }

  if (Object.keys(patch).length === 0) return { success: true };

  try {
    await db.update(projects).set(patch).where(eq(projects.id, projectId));
    await logAudit({
      actor: user,
      action: 'updated project',
      targetType: 'project',
      targetId: projectId,
      targetLabel: typeof patch.name === 'string' ? patch.name : owner.name,
      clientId: owner.clientId,
      metadata: patch,
    });

    revalidatePath(`/admin/projects/${projectId}`);
    revalidatePath(`/admin/clients/${owner.clientId}`);
    return { success: true };
  } catch (error) {
    console.error('[updateProject]', error);
    return { success: false, error: 'Failed to update project.' };
  }
}

export async function deleteProject(
  projectId: string,
  confirmName: string,
): Promise<ActionResult> {
  const user = await requireAdmin();
  const owner = await projectOwnership(projectId);
  if (!owner) return { success: false, error: 'Project not found.' };

  // Name match is case-sensitive intentionally — David has to type the
  // full project name to confirm, mirroring GitHub's repo-delete flow.
  if (confirmName.trim() !== owner.name) {
    return { success: false, error: 'Project name does not match. Type it exactly.' };
  }

  try {
    await db.delete(projects).where(eq(projects.id, projectId));
    await logAudit({
      actor: user,
      action: 'deleted project',
      targetType: 'project',
      targetId: projectId,
      targetLabel: owner.name,
      clientId: owner.clientId,
    });

    revalidatePath(`/admin/clients/${owner.clientId}`);
    return { success: true };
  } catch (error) {
    console.error('[deleteProject]', error);
    return { success: false, error: 'Failed to delete project.' };
  }
}

// ---------------------------------------------------------------------------
// Milestone CRUD
// ---------------------------------------------------------------------------

export async function addMilestone(
  projectId: string,
  input: AddMilestoneInput,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireAdmin();
  const owner = await projectOwnership(projectId);
  if (!owner) return { success: false, error: 'Project not found.' };

  if (!input.title?.trim()) {
    return { success: false, error: 'Milestone title is required.' };
  }

  try {
    // Append to the end of the list — the page can offer drag-reorder later.
    const [last] = await db
      .select({ order: milestones.order })
      .from(milestones)
      .where(eq(milestones.projectId, projectId))
      .orderBy(desc(milestones.order))
      .limit(1);
    const nextOrder = (last?.order ?? -1) + 1;

    const [created] = await db
      .insert(milestones)
      .values({
        projectId,
        title: input.title.trim(),
        category: input.category?.trim() || null,
        dueDate: input.dueDate ?? null,
        notes: input.notes?.trim() || null,
        vendorId: input.vendorId ?? null,
        status: 'upcoming',
        order: nextOrder,
      })
      .returning({ id: milestones.id, title: milestones.title });

    await recalcProgress(projectId);
    await logAudit({
      actor: user,
      action: 'added milestone',
      targetType: 'milestone',
      targetId: created.id,
      targetLabel: created.title,
      clientId: owner.clientId,
    });

    revalidatePath(`/admin/projects/${projectId}`);
    revalidatePath(`/admin/clients/${owner.clientId}`);
    return { success: true, data: { id: created.id } };
  } catch (error) {
    console.error('[addMilestone]', error);
    return { success: false, error: 'Failed to add milestone.' };
  }
}

export async function updateMilestone(
  milestoneId: string,
  projectId: string,
  input: UpdateMilestoneInput,
): Promise<ActionResult> {
  const user = await requireAdmin();
  const owner = await projectOwnership(projectId);
  if (!owner) return { success: false, error: 'Project not found.' };

  // Re-check the milestone belongs to the claimed project — protects
  // against a forged form submission targeting someone else's milestone.
  const [existing] = await db
    .select({ projectId: milestones.projectId, title: milestones.title })
    .from(milestones)
    .where(eq(milestones.id, milestoneId))
    .limit(1);
  if (!existing || existing.projectId !== projectId) {
    return { success: false, error: 'Milestone not found.' };
  }

  if (input.title !== undefined && !input.title.trim()) {
    return { success: false, error: 'Milestone title cannot be empty.' };
  }

  const patch: Record<string, unknown> = {};
  if (input.title !== undefined) patch.title = input.title.trim();
  if (input.category !== undefined) patch.category = input.category?.trim() || null;
  if (input.dueDate !== undefined) patch.dueDate = input.dueDate;
  if (input.notes !== undefined) patch.notes = input.notes?.trim() || null;
  if (input.vendorId !== undefined) patch.vendorId = input.vendorId;
  if (input.status !== undefined) patch.status = input.status;

  if (Object.keys(patch).length === 0) return { success: true };

  try {
    await db.update(milestones).set(patch).where(eq(milestones.id, milestoneId));
    if (input.status !== undefined) await recalcProgress(projectId);

    await logAudit({
      actor: user,
      action: 'updated milestone',
      targetType: 'milestone',
      targetId: milestoneId,
      targetLabel: typeof patch.title === 'string' ? patch.title : existing.title,
      clientId: owner.clientId,
      metadata: patch,
    });

    revalidatePath(`/admin/projects/${projectId}`);
    revalidatePath(`/admin/clients/${owner.clientId}`);
    return { success: true };
  } catch (error) {
    console.error('[updateMilestone]', error);
    return { success: false, error: 'Failed to update milestone.' };
  }
}

export async function deleteMilestone(
  milestoneId: string,
  projectId: string,
): Promise<ActionResult> {
  const user = await requireAdmin();
  const owner = await projectOwnership(projectId);
  if (!owner) return { success: false, error: 'Project not found.' };

  const [existing] = await db
    .select({ projectId: milestones.projectId, title: milestones.title })
    .from(milestones)
    .where(eq(milestones.id, milestoneId))
    .limit(1);
  if (!existing || existing.projectId !== projectId) {
    return { success: false, error: 'Milestone not found.' };
  }

  try {
    await db.delete(milestones).where(eq(milestones.id, milestoneId));
    await recalcProgress(projectId);
    await logAudit({
      actor: user,
      action: 'deleted milestone',
      targetType: 'milestone',
      targetId: milestoneId,
      targetLabel: existing.title,
      clientId: owner.clientId,
    });

    revalidatePath(`/admin/projects/${projectId}`);
    revalidatePath(`/admin/clients/${owner.clientId}`);
    return { success: true };
  } catch (error) {
    console.error('[deleteMilestone]', error);
    return { success: false, error: 'Failed to delete milestone.' };
  }
}

/**
 * Promote a decision-style milestone from `upcoming` to `awaiting_client`
 * — this is what makes it appear on the client portal's Decisions list.
 * Only valid for milestones that already have a question type; refuses
 * to promote already-resolved or non-decision rows.
 */
export async function markDecisionAwaitingClient(
  milestoneId: string,
  projectId: string,
): Promise<ActionResult> {
  const user = await requireAdmin();
  const owner = await projectOwnership(projectId);
  if (!owner) return { success: false, error: 'Project not found.' };

  const [existing] = await db
    .select({
      projectId: milestones.projectId,
      title: milestones.title,
      status: milestones.status,
      questionType: milestones.questionType,
    })
    .from(milestones)
    .where(and(eq(milestones.id, milestoneId), eq(milestones.projectId, projectId)))
    .limit(1);
  if (!existing) return { success: false, error: 'Milestone not found.' };
  if (!existing.questionType) {
    return {
      success: false,
      error: 'Only decision milestones (with a question type) can be sent to the client.',
    };
  }
  if (existing.status === 'complete') {
    return { success: false, error: 'Cannot send a completed milestone.' };
  }
  if (existing.status === 'awaiting_client') {
    return { success: false, error: 'Already sent to the client.' };
  }

  try {
    await db
      .update(milestones)
      .set({ status: 'awaiting_client' })
      .where(eq(milestones.id, milestoneId));

    await logAudit({
      actor: user,
      action: 'requested decision from client',
      targetType: 'milestone',
      targetId: milestoneId,
      targetLabel: existing.title,
      clientId: owner.clientId,
    });

    // Bell feed: notify every portal user attached to this client.
    // Best-effort — `createNotification` swallows DB errors so a
    // broken feed never blocks the decision push. Link points at the
    // portal Decisions list (today aggregated across properties on
    // the dashboard / project timeline; the dedicated route can be
    // wired up when it ships).
    try {
      const recipients = await getClientRecipientUserIds(owner.clientId);
      await Promise.all(
        recipients.map((recipientUserId) =>
          createNotification({
            recipientUserId,
            kind: 'decision_pushed',
            title: 'A new decision needs your input',
            body: existing.title,
            link: '/portal',
            relatedEntityType: 'decision',
            relatedEntityId: milestoneId,
          }),
        ),
      );
    } catch (error) {
      console.error('[markDecisionAwaitingClient] notify failed', error);
    }

    revalidatePath(`/admin/projects/${projectId}`);
    revalidatePath(`/admin/clients/${owner.clientId}`);
    revalidatePath('/admin/decisions');
    return { success: true };
  } catch (error) {
    console.error('[markDecisionAwaitingClient]', error);
    return { success: false, error: 'Failed to send decision.' };
  }
}

// ---------------------------------------------------------------------------
// Field-staff project assignments
// ---------------------------------------------------------------------------

/**
 * Resolve a profile id to a staff name + role + active flag. Used by
 * the assign/unassign actions to verify the target is actually an
 * active field-staff member before recording the assignment, and to
 * grab a name for the audit row.
 */
async function profileAsField(profileId: string): Promise<{
  ok: true;
  name: string;
} | {
  ok: false;
  error: string;
}> {
  const [row] = await db
    .select({
      role: staff.role,
      status: staff.status,
      name: staff.name,
    })
    .from(profiles)
    .innerJoin(staff, eq(staff.id, profiles.staffId))
    .where(eq(profiles.id, profileId))
    .limit(1);
  if (!row) return { ok: false, error: 'Staff profile not found.' };
  if (row.role !== 'field_staff') {
    return { ok: false, error: 'Only field staff can be assigned to projects.' };
  }
  if (row.status !== 'active') {
    return { ok: false, error: 'That staff member is not active.' };
  }
  return { ok: true, name: row.name };
}

export async function assignStaffToProject(
  projectId: string,
  profileId: string,
): Promise<ActionResult> {
  const user = await requireAdmin();
  const owner = await projectOwnership(projectId);
  if (!owner) return { success: false, error: 'Project not found.' };

  const target = await profileAsField(profileId);
  if (!target.ok) return { success: false, error: target.error };

  try {
    // Composite PK on (project_id, user_id) makes the insert idempotent —
    // ON CONFLICT DO NOTHING means re-clicking Add doesn't error.
    await db
      .insert(projectAssignments)
      .values({ projectId, userId: profileId })
      .onConflictDoNothing();

    await logAudit({
      actor: user,
      action: 'assigned staff to project',
      targetType: 'project',
      targetId: projectId,
      targetLabel: `${target.name} → ${owner.name}`,
      clientId: owner.clientId,
      metadata: { profileId },
    });

    revalidatePath(`/admin/projects/${projectId}`);
    return { success: true };
  } catch (error) {
    console.error('[assignStaffToProject]', error);
    return { success: false, error: 'Failed to assign staff.' };
  }
}

export async function unassignStaffFromProject(
  projectId: string,
  profileId: string,
): Promise<ActionResult> {
  const user = await requireAdmin();
  const owner = await projectOwnership(projectId);
  if (!owner) return { success: false, error: 'Project not found.' };

  // We don't gate on `profileAsField` here — even if the staff member
  // has been deactivated since being assigned, an admin should still
  // be able to clean up the orphan row. Only the audit name lookup
  // matters, and we can fall back to the profile id.
  const [row] = await db
    .select({ name: staff.name })
    .from(profiles)
    .leftJoin(staff, eq(staff.id, profiles.staffId))
    .where(eq(profiles.id, profileId))
    .limit(1);
  const targetName = row?.name ?? profileId.slice(0, 8);

  try {
    await db
      .delete(projectAssignments)
      .where(
        and(
          eq(projectAssignments.projectId, projectId),
          eq(projectAssignments.userId, profileId),
        ),
      );

    await logAudit({
      actor: user,
      action: 'unassigned staff from project',
      targetType: 'project',
      targetId: projectId,
      targetLabel: `${targetName} ✕ ${owner.name}`,
      clientId: owner.clientId,
      metadata: { profileId },
    });

    revalidatePath(`/admin/projects/${projectId}`);
    return { success: true };
  } catch (error) {
    console.error('[unassignStaffFromProject]', error);
    return { success: false, error: 'Failed to remove staff.' };
  }
}
