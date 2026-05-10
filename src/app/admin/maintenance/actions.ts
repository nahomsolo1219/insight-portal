'use server';

// Mutations for the admin /admin/maintenance surface. Every action is
// gated by requireAdmin() and writes to logAudit() after its Drizzle
// write. Visit-with-date inserts also create / update the
// `appointments` row that backs the visit so the schedule and
// calendar pages can render maintenance work alongside project work
// without a second source.
//
// All actions accept input from the builder UI under the same
// shape that `getPlanDetail` / `getPlanVisits` return, so the form
// state on the client side maps 1:1 to the action argument.

import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import {
  appointments,
  maintenancePlans,
  maintenanceVisits,
  maintenanceVisitScopeItems,
  properties,
} from '@/db/schema';
import { logAudit } from '@/lib/audit';
import { requireAdmin } from '@/lib/auth/current-user';
import { distributeVisits } from '@/lib/maintenance/recurrence';
import {
  PLAN_STATUSES,
  VISIT_STATUSES,
  type PlanStatus,
  type VisitStatus,
} from '@/lib/maintenance/queries';
import { DEFAULT_SCOPE_TYPES, SCOPE_TYPE_VALUES } from '@/lib/maintenance/scope-types';
import { maintenancePlanDocumentPath } from '@/lib/storage/paths';
import { uploadSingleFromForm } from '@/lib/storage/upload-from-form';

export type ActionResult<T = unknown> =
  | ({ success: true } & T)
  | { success: false; error: string };

// ---------------------------------------------------------------------------
// Plan-level mutations
// ---------------------------------------------------------------------------

export interface VisitInput {
  /** YYYY-MM-DD */
  scheduledDate: string;
  title: string;
  visitOrder: number;
  vendorId?: string | null;
  assignedFieldStaffId?: string | null;
  /** Scope-type values from src/lib/maintenance/scope-types.ts. The
   *  custom value uses `customLabel`. */
  scopeItems?: ScopeItemInput[];
}

export interface ScopeItemInput {
  scopeType: string;
  customLabel?: string | null;
  vendorId?: string | null;
}

export interface CreateMaintenancePlanInput {
  propertyId: string;
  name: string;
  /** YYYY-MM-DD */
  startDate: string;
  /** YYYY-MM-DD */
  endDate: string;
  visitCount: number;
  /** When true, ignores any `visits` array and auto-distributes. */
  autoDistribute: boolean;
  /** Used when autoDistribute === false. */
  visits?: VisitInput[];
  billingTotalCents?: number | null;
  billingCadence?: string | null;
  notes?: string | null;
  /** When true the plan is created in 'active' status; default 'draft'. */
  activate?: boolean;
}

/**
 * Create a plan plus its visits, scope items, and the appointment
 * rows that back each visit, in a single transaction. Returns the
 * created plan's id on success.
 */
export async function createMaintenancePlan(
  input: CreateMaintenancePlanInput,
): Promise<ActionResult<{ planId: string }>> {
  const user = await requireAdmin();

  const validation = validatePlanInput(input);
  if (validation) return { success: false, error: validation };

  // Ownership check on the property — RLS would also block, but a
  // pre-flight check returns a friendly error instead of a 500.
  const [prop] = await db
    .select({ id: properties.id, clientId: properties.clientId, name: properties.name })
    .from(properties)
    .where(eq(properties.id, input.propertyId))
    .limit(1);
  if (!prop) return { success: false, error: 'Property not found.' };

  const planId = randomUUID();
  const status: PlanStatus = input.activate ? 'active' : 'draft';

  // Resolve the visit list — auto-distribute or use the provided
  // array. The auto-distribute helper produces evenly-spaced dates
  // and default titles; admin can edit them on the visits step.
  let visits: VisitInput[];
  if (input.autoDistribute || !input.visits || input.visits.length === 0) {
    visits = distributeVisits({
      startDate: input.startDate,
      endDate: input.endDate,
      visitCount: input.visitCount,
    }).map((v) => ({
      scheduledDate: v.scheduledDate,
      title: v.title,
      visitOrder: v.visitOrder,
      scopeItems: DEFAULT_SCOPE_TYPES.map((scopeType) => ({ scopeType })),
    }));
  } else {
    visits = [...input.visits].sort((a, b) => a.visitOrder - b.visitOrder);
  }

  try {
    await db.transaction(async (tx) => {
      await tx.insert(maintenancePlans).values({
        id: planId,
        propertyId: input.propertyId,
        name: input.name.trim(),
        startDate: input.startDate,
        endDate: input.endDate,
        billingTotalCents: input.billingTotalCents ?? null,
        billingCadence: input.billingCadence ?? null,
        status,
        notes: input.notes?.trim() || null,
        createdBy: user.id,
      });

      for (const v of visits) {
        const visitId = randomUUID();
        // Maintenance visits land on the schedule via a paired
        // appointments row — same pattern projects use. Status is
        // 'scheduled' until admin (or field staff) marks it.
        const appointmentId = await createBackingAppointment({
          tx,
          propertyId: input.propertyId,
          title: `${input.name} — ${v.title}`,
          date: v.scheduledDate,
          vendorId: v.vendorId ?? null,
        });

        await tx.insert(maintenanceVisits).values({
          id: visitId,
          planId,
          title: v.title.trim(),
          scheduledDate: v.scheduledDate,
          status: 'scheduled',
          visitOrder: v.visitOrder,
          isAdHoc: false,
          vendorId: v.vendorId ?? null,
          assignedFieldStaffId: v.assignedFieldStaffId ?? null,
          appointmentId,
        });

        if (v.scopeItems && v.scopeItems.length > 0) {
          await tx.insert(maintenanceVisitScopeItems).values(
            v.scopeItems.map((s, i) => ({
              id: randomUUID(),
              visitId,
              scopeType: s.scopeType,
              customLabel: s.scopeType === 'custom' ? (s.customLabel?.trim() || null) : null,
              vendorId: s.vendorId ?? null,
              completed: false,
              itemOrder: i,
            })),
          );
        }
      }
    });

    await logAudit({
      actor: user,
      action: 'created maintenance plan',
      targetType: 'maintenance_plan',
      targetId: planId,
      targetLabel: input.name.trim(),
      clientId: prop.clientId,
      metadata: { visitCount: visits.length, status },
    });

    revalidatePath('/admin/maintenance');
    revalidatePath(`/admin/maintenance/${planId}`);
    revalidatePath(`/admin/clients/${prop.clientId}`);
    revalidatePath('/admin/schedule');

    return { success: true, planId };
  } catch (error) {
    console.error('[createMaintenancePlan]', error);
    return { success: false, error: 'Failed to create plan. Try again.' };
  }
}

export interface UpdatePlanInput {
  name?: string;
  startDate?: string;
  endDate?: string;
  billingTotalCents?: number | null;
  billingCadence?: string | null;
  status?: PlanStatus;
  notes?: string | null;
}

export async function updatePlan(
  planId: string,
  patch: UpdatePlanInput,
): Promise<ActionResult> {
  const user = await requireAdmin();

  const [plan] = await db
    .select({
      id: maintenancePlans.id,
      name: maintenancePlans.name,
      propertyId: maintenancePlans.propertyId,
      clientId: properties.clientId,
    })
    .from(maintenancePlans)
    .innerJoin(properties, eq(properties.id, maintenancePlans.propertyId))
    .where(eq(maintenancePlans.id, planId))
    .limit(1);
  if (!plan) return { success: false, error: 'Plan not found.' };

  if (patch.status && !PLAN_STATUSES.includes(patch.status)) {
    return { success: false, error: 'Invalid status.' };
  }
  if (patch.name !== undefined && !patch.name.trim()) {
    return { success: false, error: 'Name is required.' };
  }
  if (patch.startDate && patch.endDate && patch.startDate > patch.endDate) {
    return { success: false, error: 'End date must be after start date.' };
  }

  try {
    await db
      .update(maintenancePlans)
      .set({
        ...(patch.name !== undefined && { name: patch.name.trim() }),
        ...(patch.startDate !== undefined && { startDate: patch.startDate }),
        ...(patch.endDate !== undefined && { endDate: patch.endDate }),
        ...(patch.billingTotalCents !== undefined && {
          billingTotalCents: patch.billingTotalCents,
        }),
        ...(patch.billingCadence !== undefined && {
          billingCadence: patch.billingCadence,
        }),
        ...(patch.status !== undefined && { status: patch.status }),
        ...(patch.notes !== undefined && {
          notes: patch.notes ? patch.notes.trim() : null,
        }),
        updatedAt: new Date(),
      })
      .where(eq(maintenancePlans.id, planId));

    await logAudit({
      actor: user,
      action: 'updated maintenance plan',
      targetType: 'maintenance_plan',
      targetId: planId,
      targetLabel: patch.name?.trim() ?? plan.name,
      clientId: plan.clientId,
    });

    revalidatePath('/admin/maintenance');
    revalidatePath(`/admin/maintenance/${planId}`);
    revalidatePath(`/admin/clients/${plan.clientId}`);
    return { success: true };
  } catch (error) {
    console.error('[updatePlan]', error);
    return { success: false, error: 'Failed to update plan. Try again.' };
  }
}

export async function archivePlan(planId: string): Promise<ActionResult> {
  const user = await requireAdmin();

  const [plan] = await db
    .select({
      id: maintenancePlans.id,
      name: maintenancePlans.name,
      clientId: properties.clientId,
    })
    .from(maintenancePlans)
    .innerJoin(properties, eq(properties.id, maintenancePlans.propertyId))
    .where(eq(maintenancePlans.id, planId))
    .limit(1);
  if (!plan) return { success: false, error: 'Plan not found.' };

  await db
    .update(maintenancePlans)
    .set({ status: 'archived', updatedAt: new Date() })
    .where(eq(maintenancePlans.id, planId));

  await logAudit({
    actor: user,
    action: 'archived maintenance plan',
    targetType: 'maintenance_plan',
    targetId: planId,
    targetLabel: plan.name,
    clientId: plan.clientId,
  });

  revalidatePath('/admin/maintenance');
  revalidatePath(`/admin/maintenance/${planId}`);
  revalidatePath(`/admin/clients/${plan.clientId}`);
  return { success: true };
}

// ---------------------------------------------------------------------------
// Visit-level mutations
// ---------------------------------------------------------------------------

export interface AddVisitInput {
  title: string;
  scheduledDate: string;
  vendorId?: string | null;
  assignedFieldStaffId?: string | null;
  notes?: string | null;
  /** Defaults to true — ad-hoc visits are the typical mid-plan use. */
  isAdHoc?: boolean;
  scopeItems?: ScopeItemInput[];
}

export async function addVisit(
  planId: string,
  input: AddVisitInput,
): Promise<ActionResult<{ visitId: string }>> {
  const user = await requireAdmin();

  if (!input.title.trim()) return { success: false, error: 'Title is required.' };
  if (!input.scheduledDate) return { success: false, error: 'Date is required.' };

  const [plan] = await db
    .select({
      id: maintenancePlans.id,
      name: maintenancePlans.name,
      propertyId: maintenancePlans.propertyId,
      clientId: properties.clientId,
    })
    .from(maintenancePlans)
    .innerJoin(properties, eq(properties.id, maintenancePlans.propertyId))
    .where(eq(maintenancePlans.id, planId))
    .limit(1);
  if (!plan) return { success: false, error: 'Plan not found.' };

  // Append at the end of the visit list — visit_order is purely
  // for display, not meaning, so a tail insert keeps the list
  // chronological in the order admin added.
  const existing = await db
    .select({ visitOrder: maintenanceVisits.visitOrder })
    .from(maintenanceVisits)
    .where(eq(maintenanceVisits.planId, planId));
  const nextOrder = existing.reduce((max, r) => Math.max(max, r.visitOrder), -1) + 1;

  const visitId = randomUUID();

  try {
    await db.transaction(async (tx) => {
      const appointmentId = await createBackingAppointment({
        tx,
        propertyId: plan.propertyId,
        title: `${plan.name} — ${input.title.trim()}`,
        date: input.scheduledDate,
        vendorId: input.vendorId ?? null,
      });

      await tx.insert(maintenanceVisits).values({
        id: visitId,
        planId,
        title: input.title.trim(),
        scheduledDate: input.scheduledDate,
        status: 'scheduled',
        visitOrder: nextOrder,
        isAdHoc: input.isAdHoc ?? true,
        vendorId: input.vendorId ?? null,
        assignedFieldStaffId: input.assignedFieldStaffId ?? null,
        appointmentId,
        notes: input.notes?.trim() || null,
      });

      if (input.scopeItems && input.scopeItems.length > 0) {
        await tx.insert(maintenanceVisitScopeItems).values(
          input.scopeItems.map((s, i) => ({
            id: randomUUID(),
            visitId,
            scopeType: s.scopeType,
            customLabel: s.scopeType === 'custom' ? (s.customLabel?.trim() || null) : null,
            vendorId: s.vendorId ?? null,
            completed: false,
            itemOrder: i,
          })),
        );
      }
    });

    await logAudit({
      actor: user,
      action: 'added maintenance visit',
      targetType: 'maintenance_visit',
      targetId: visitId,
      targetLabel: input.title.trim(),
      clientId: plan.clientId,
      metadata: { planId, isAdHoc: input.isAdHoc ?? true },
    });

    revalidatePath(`/admin/maintenance/${planId}`);
    revalidatePath('/admin/schedule');

    return { success: true, visitId };
  } catch (error) {
    console.error('[addVisit]', error);
    return { success: false, error: 'Failed to add visit. Try again.' };
  }
}

export interface UpdateVisitInput {
  title?: string;
  scheduledDate?: string;
  status?: VisitStatus;
  vendorId?: string | null;
  assignedFieldStaffId?: string | null;
  notes?: string | null;
}

export async function updateVisit(
  visitId: string,
  patch: UpdateVisitInput,
): Promise<ActionResult> {
  const user = await requireAdmin();

  if (patch.status && !VISIT_STATUSES.includes(patch.status)) {
    return { success: false, error: 'Invalid status.' };
  }
  if (patch.title !== undefined && !patch.title.trim()) {
    return { success: false, error: 'Title is required.' };
  }

  const [visit] = await db
    .select({
      id: maintenanceVisits.id,
      title: maintenanceVisits.title,
      planId: maintenanceVisits.planId,
      planName: maintenancePlans.name,
      scheduledDate: maintenanceVisits.scheduledDate,
      vendorId: maintenanceVisits.vendorId,
      appointmentId: maintenanceVisits.appointmentId,
      propertyId: maintenancePlans.propertyId,
      clientId: properties.clientId,
    })
    .from(maintenanceVisits)
    .innerJoin(maintenancePlans, eq(maintenancePlans.id, maintenanceVisits.planId))
    .innerJoin(properties, eq(properties.id, maintenancePlans.propertyId))
    .where(eq(maintenanceVisits.id, visitId))
    .limit(1);
  if (!visit) return { success: false, error: 'Visit not found.' };

  try {
    const completedAt =
      patch.status === 'completed'
        ? new Date()
        : patch.status === 'cancelled' || patch.status === 'in_progress' || patch.status === 'scheduled'
          ? null
          : undefined;

    await db
      .update(maintenanceVisits)
      .set({
        ...(patch.title !== undefined && { title: patch.title.trim() }),
        ...(patch.scheduledDate !== undefined && { scheduledDate: patch.scheduledDate }),
        ...(patch.status !== undefined && { status: patch.status }),
        ...(patch.vendorId !== undefined && { vendorId: patch.vendorId }),
        ...(patch.assignedFieldStaffId !== undefined && {
          assignedFieldStaffId: patch.assignedFieldStaffId,
        }),
        ...(patch.notes !== undefined && {
          notes: patch.notes ? patch.notes.trim() : null,
        }),
        ...(completedAt !== undefined && { completedAt }),
        updatedAt: new Date(),
      })
      .where(eq(maintenanceVisits.id, visitId));

    // Keep the backing appointment in sync — title, date, vendor.
    // Status on the appointment stays 'scheduled' until admin
    // explicitly cancels (visit.status === 'cancelled' maps to
    // appointment.status 'cancelled'); 'completed' on visit also
    // marks the appointment complete so the calendar reads right.
    if (visit.appointmentId) {
      const appointmentStatus =
        patch.status === 'cancelled'
          ? 'cancelled'
          : patch.status === 'completed'
            ? 'completed'
            : patch.status === 'in_progress' || patch.status === 'scheduled'
              ? 'scheduled'
              : undefined;

      const newTitle = patch.title?.trim();
      await db
        .update(appointments)
        .set({
          ...(newTitle && { title: `${visit.planName} — ${newTitle}` }),
          ...(patch.scheduledDate && { date: patch.scheduledDate }),
          ...(patch.vendorId !== undefined && { vendorId: patch.vendorId }),
          ...(appointmentStatus && { status: appointmentStatus }),
          updatedAt: new Date(),
        })
        .where(eq(appointments.id, visit.appointmentId));
    }

    await logAudit({
      actor: user,
      action: 'updated maintenance visit',
      targetType: 'maintenance_visit',
      targetId: visitId,
      targetLabel: patch.title?.trim() ?? visit.title,
      clientId: visit.clientId,
    });

    revalidatePath(`/admin/maintenance/${visit.planId}`);
    revalidatePath('/admin/schedule');

    return { success: true };
  } catch (error) {
    console.error('[updateVisit]', error);
    return { success: false, error: 'Failed to update visit.' };
  }
}

export async function deleteVisit(visitId: string): Promise<ActionResult> {
  const user = await requireAdmin();

  const [visit] = await db
    .select({
      id: maintenanceVisits.id,
      title: maintenanceVisits.title,
      planId: maintenanceVisits.planId,
      appointmentId: maintenanceVisits.appointmentId,
      clientId: properties.clientId,
    })
    .from(maintenanceVisits)
    .innerJoin(maintenancePlans, eq(maintenancePlans.id, maintenanceVisits.planId))
    .innerJoin(properties, eq(properties.id, maintenancePlans.propertyId))
    .where(eq(maintenanceVisits.id, visitId))
    .limit(1);
  if (!visit) return { success: false, error: 'Visit not found.' };

  // Refuse the delete if any scope item is already completed —
  // that's the rule from the spec, and it keeps the audit trail
  // useful (a completed visit is part of the service record).
  const completedItems = await db
    .select({ id: maintenanceVisitScopeItems.id })
    .from(maintenanceVisitScopeItems)
    .where(
      and(
        eq(maintenanceVisitScopeItems.visitId, visitId),
        eq(maintenanceVisitScopeItems.completed, true),
      ),
    );
  if (completedItems.length > 0) {
    return {
      success: false,
      error: 'Cannot delete a visit with completed scope items. Mark the visit cancelled instead.',
    };
  }

  try {
    await db.transaction(async (tx) => {
      await tx.delete(maintenanceVisits).where(eq(maintenanceVisits.id, visitId));
      // Scope items cascade. Drop the backing appointment too.
      if (visit.appointmentId) {
        await tx.delete(appointments).where(eq(appointments.id, visit.appointmentId));
      }
    });

    await logAudit({
      actor: user,
      action: 'deleted maintenance visit',
      targetType: 'maintenance_visit',
      targetId: visitId,
      targetLabel: visit.title,
      clientId: visit.clientId,
    });

    revalidatePath(`/admin/maintenance/${visit.planId}`);
    revalidatePath('/admin/schedule');

    return { success: true };
  } catch (error) {
    console.error('[deleteVisit]', error);
    return { success: false, error: 'Failed to delete visit.' };
  }
}

/**
 * Replace the scope items on a visit. Same delete-and-reinsert
 * pattern the templates module uses so the order/types are easy to
 * reason about; completed flags reset on rewrite (callers that want
 * to preserve completion should `markScopeItemComplete` separately).
 */
export async function setVisitScope(
  visitId: string,
  items: ScopeItemInput[],
): Promise<ActionResult> {
  const user = await requireAdmin();

  for (const i of items) {
    if (!SCOPE_TYPE_VALUES.includes(i.scopeType)) {
      return { success: false, error: `Invalid scope type: ${i.scopeType}` };
    }
  }

  const [visit] = await db
    .select({
      id: maintenanceVisits.id,
      title: maintenanceVisits.title,
      planId: maintenanceVisits.planId,
      clientId: properties.clientId,
    })
    .from(maintenanceVisits)
    .innerJoin(maintenancePlans, eq(maintenancePlans.id, maintenanceVisits.planId))
    .innerJoin(properties, eq(properties.id, maintenancePlans.propertyId))
    .where(eq(maintenanceVisits.id, visitId))
    .limit(1);
  if (!visit) return { success: false, error: 'Visit not found.' };

  try {
    await db.transaction(async (tx) => {
      await tx
        .delete(maintenanceVisitScopeItems)
        .where(eq(maintenanceVisitScopeItems.visitId, visitId));

      if (items.length > 0) {
        await tx.insert(maintenanceVisitScopeItems).values(
          items.map((s, i) => ({
            id: randomUUID(),
            visitId,
            scopeType: s.scopeType,
            customLabel: s.scopeType === 'custom' ? (s.customLabel?.trim() || null) : null,
            vendorId: s.vendorId ?? null,
            completed: false,
            itemOrder: i,
          })),
        );
      }
    });

    await logAudit({
      actor: user,
      action: 'updated maintenance scope',
      targetType: 'maintenance_visit',
      targetId: visitId,
      targetLabel: visit.title,
      clientId: visit.clientId,
      metadata: { itemCount: items.length },
    });

    revalidatePath(`/admin/maintenance/${visit.planId}`);
    return { success: true };
  } catch (error) {
    console.error('[setVisitScope]', error);
    return { success: false, error: 'Failed to update scope.' };
  }
}

/**
 * Mark a scope item complete (or uncomplete) and stash the
 * completion notes. This is the only mutation field staff have
 * access to via RLS — the action is admin-only here, but the same
 * shape will be reused on the field surface in a follow-up.
 */
export async function markScopeItemComplete(
  itemId: string,
  notes?: string | null,
  completed = true,
): Promise<ActionResult> {
  const user = await requireAdmin();

  const [item] = await db
    .select({
      id: maintenanceVisitScopeItems.id,
      visitId: maintenanceVisitScopeItems.visitId,
      scopeType: maintenanceVisitScopeItems.scopeType,
      customLabel: maintenanceVisitScopeItems.customLabel,
      planId: maintenanceVisits.planId,
      visitTitle: maintenanceVisits.title,
      clientId: properties.clientId,
    })
    .from(maintenanceVisitScopeItems)
    .innerJoin(maintenanceVisits, eq(maintenanceVisits.id, maintenanceVisitScopeItems.visitId))
    .innerJoin(maintenancePlans, eq(maintenancePlans.id, maintenanceVisits.planId))
    .innerJoin(properties, eq(properties.id, maintenancePlans.propertyId))
    .where(eq(maintenanceVisitScopeItems.id, itemId))
    .limit(1);
  if (!item) return { success: false, error: 'Scope item not found.' };

  try {
    await db
      .update(maintenanceVisitScopeItems)
      .set({
        completed,
        completionNotes: notes?.trim() || null,
        updatedAt: new Date(),
      })
      .where(eq(maintenanceVisitScopeItems.id, itemId));

    await logAudit({
      actor: user,
      action: 'completed maintenance scope item',
      targetType: 'maintenance_scope_item',
      targetId: itemId,
      targetLabel:
        item.scopeType === 'custom'
          ? (item.customLabel ?? 'Custom item')
          : item.scopeType,
      clientId: item.clientId,
      metadata: { visitId: item.visitId, completed },
    });

    revalidatePath(`/admin/maintenance/${item.planId}`);
    return { success: true };
  } catch (error) {
    console.error('[markScopeItemComplete]', error);
    return { success: false, error: 'Failed to update scope item.' };
  }
}

// ---------------------------------------------------------------------------
// Plan documents — home assessment + playbook PDFs
// ---------------------------------------------------------------------------

export type PlanDocumentKind = 'home_assessment' | 'playbook';

/**
 * Upload (or replace) the home assessment / playbook PDF for a plan.
 * Single-file form: the field name is `file`. Stored under
 * `maintenance/{clientId}/{planId}/{kind}.{ext}` in the
 * insight-files bucket.
 */
export async function uploadPlanDocument(
  planId: string,
  kind: PlanDocumentKind,
  formData: FormData,
): Promise<ActionResult<{ path: string }>> {
  const user = await requireAdmin();

  if (kind !== 'home_assessment' && kind !== 'playbook') {
    return { success: false, error: 'Invalid document kind.' };
  }

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { success: false, error: 'No file provided.' };
  }

  // PDFs only — this surface deliberately doesn't accept anything
  // else; a misuploaded JPEG would clutter the plan detail.
  if (file.type && file.type !== 'application/pdf') {
    return { success: false, error: 'Plan documents must be PDF.' };
  }

  const [plan] = await db
    .select({
      id: maintenancePlans.id,
      name: maintenancePlans.name,
      clientId: properties.clientId,
    })
    .from(maintenancePlans)
    .innerJoin(properties, eq(properties.id, maintenancePlans.propertyId))
    .where(eq(maintenancePlans.id, planId))
    .limit(1);
  if (!plan) return { success: false, error: 'Plan not found.' };

  const ext = file.name.split('.').pop() ?? 'pdf';
  const path = maintenancePlanDocumentPath(plan.clientId, planId, kind, ext);

  // upsert: true lets a re-upload overwrite the existing file at the
  // same canonical path. The `?v=` cache-bust trick the rest of the
  // codebase uses isn't needed here — we sign a fresh URL on every
  // render, and signed URLs already cache-bust on expiry.
  const result = await uploadSingleFromForm(formData, 'file', path);
  if (!result.success) return { success: false, error: result.error };

  await db
    .update(maintenancePlans)
    .set({
      [kind === 'home_assessment' ? 'homeAssessmentUrl' : 'playbookUrl']: result.path,
      updatedAt: new Date(),
    })
    .where(eq(maintenancePlans.id, planId));

  await logAudit({
    actor: user,
    action: 'uploaded maintenance plan document',
    targetType: 'maintenance_plan',
    targetId: planId,
    targetLabel: plan.name,
    clientId: plan.clientId,
    metadata: { kind, path: result.path },
  });

  revalidatePath(`/admin/maintenance/${planId}`);
  return { success: true, path: result.path };
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/**
 * Insert an `appointments` row with kind = 'maintenance' for the
 * given visit metadata. Returns the new appointment id; the caller
 * threads it onto `maintenance_visits.appointment_id`.
 */
async function createBackingAppointment({
  tx,
  propertyId,
  title,
  date,
  vendorId,
}: {
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0];
  propertyId: string;
  title: string;
  date: string;
  vendorId: string | null;
}): Promise<string> {
  const id = randomUUID();
  await tx.insert(appointments).values({
    id,
    propertyId,
    projectId: null,
    milestoneId: null,
    title,
    vendorId,
    date,
    status: 'scheduled',
    kind: 'maintenance',
    davidOnSite: false,
  });
  return id;
}

function validatePlanInput(input: CreateMaintenancePlanInput): string | null {
  if (!input.propertyId) return 'Property is required.';
  if (!input.name?.trim()) return 'Plan name is required.';
  if (!input.startDate) return 'Start date is required.';
  if (!input.endDate) return 'End date is required.';
  if (input.startDate > input.endDate) return 'End date must be after start date.';
  if (!Number.isFinite(input.visitCount) || input.visitCount < 0) {
    return 'Visit count must be zero or more.';
  }
  if (input.visitCount > 52) {
    return 'A single plan cannot have more than 52 visits.';
  }
  if (!input.autoDistribute && input.visits) {
    for (const v of input.visits) {
      if (!v.title?.trim()) return 'Every visit needs a title.';
      if (!v.scheduledDate) return 'Every visit needs a date.';
      if (v.scheduledDate < input.startDate || v.scheduledDate > input.endDate) {
        return `Visit "${v.title}" falls outside the plan's date range.`;
      }
      if (v.scopeItems) {
        for (const s of v.scopeItems) {
          if (!SCOPE_TYPE_VALUES.includes(s.scopeType)) {
            return `Invalid scope type: ${s.scopeType}`;
          }
          if (s.scopeType === 'custom' && !s.customLabel?.trim()) {
            return 'Custom scope items need a label.';
          }
        }
      }
    }
  }
  return null;
}

