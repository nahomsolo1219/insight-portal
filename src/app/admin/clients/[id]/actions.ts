'use server';

import { and, count, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { clients, milestones, projects, properties } from '@/db/schema';
import { logAudit } from '@/lib/audit';
import { requireAdmin } from '@/lib/auth/current-user';

type ActionResult = { success: true } | { success: false; error: string };

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

export interface UpdatePropertyInput {
  name: string;
  address: string;
  city: string;
  state: string;
  zipcode?: string | null;
  sqft?: number | null;
  yearBuilt?: number | null;
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
