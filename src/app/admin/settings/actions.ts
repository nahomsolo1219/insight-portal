'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { emailTemplates, membershipTiers } from '@/db/schema';
import { logAudit } from '@/lib/audit';
import { requireAdmin } from '@/lib/auth/current-user';

type ActionResult<T = undefined> =
  | { success: true; data?: T }
  | { success: false; error: string };

// ---------------------------------------------------------------------------
// Membership tiers
// ---------------------------------------------------------------------------

export interface TierInput {
  name: string;
  /** Integer cents — UI parses dollars → cents before sending. */
  annualPriceCents: number;
  description?: string | null;
}

export async function createTier(
  input: TierInput,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireAdmin();

  if (!input.name?.trim()) return { success: false, error: 'Tier name is required.' };
  if (!Number.isFinite(input.annualPriceCents) || input.annualPriceCents <= 0) {
    return { success: false, error: 'Annual price must be greater than zero.' };
  }
  if (!Number.isInteger(input.annualPriceCents)) {
    return { success: false, error: 'Price must be a whole number of cents.' };
  }

  try {
    const [tier] = await db
      .insert(membershipTiers)
      .values({
        name: input.name.trim(),
        annualPriceCents: input.annualPriceCents,
        description: input.description?.trim() || null,
      })
      .returning({ id: membershipTiers.id, name: membershipTiers.name });

    await logAudit({
      actor: user,
      action: 'created tier',
      targetType: 'tier',
      targetId: tier.id,
      targetLabel: tier.name,
      metadata: { annualPriceCents: input.annualPriceCents },
    });

    revalidatePath('/admin/settings');
    revalidatePath('/admin/clients');
    return { success: true, data: { id: tier.id } };
  } catch (error) {
    console.error('[createTier]', error);
    return { success: false, error: 'Failed to create tier.' };
  }
}

export async function updateTier(
  tierId: string,
  input: TierInput,
): Promise<ActionResult> {
  const user = await requireAdmin();

  if (!input.name?.trim()) return { success: false, error: 'Tier name is required.' };
  if (!Number.isFinite(input.annualPriceCents) || input.annualPriceCents <= 0) {
    return { success: false, error: 'Annual price must be greater than zero.' };
  }

  try {
    const [updated] = await db
      .update(membershipTiers)
      .set({
        name: input.name.trim(),
        annualPriceCents: input.annualPriceCents,
        description: input.description?.trim() || null,
      })
      .where(eq(membershipTiers.id, tierId))
      .returning({ id: membershipTiers.id, name: membershipTiers.name });

    if (!updated) return { success: false, error: 'Tier not found.' };

    await logAudit({
      actor: user,
      action: 'updated tier',
      targetType: 'tier',
      targetId: updated.id,
      targetLabel: updated.name,
      metadata: { annualPriceCents: input.annualPriceCents },
    });

    revalidatePath('/admin/settings');
    revalidatePath('/admin/clients');
    return { success: true };
  } catch (error) {
    console.error('[updateTier]', error);
    return { success: false, error: 'Failed to update tier.' };
  }
}

/**
 * Delete a tier. Clients referencing it get their `membership_tier_id`
 * set to NULL via the FK's `onDelete: 'set null'` — they survive the
 * delete and just show as "No tier" afterwards.
 */
export async function deleteTier(tierId: string): Promise<ActionResult> {
  const user = await requireAdmin();

  try {
    const [tier] = await db
      .select({ id: membershipTiers.id, name: membershipTiers.name })
      .from(membershipTiers)
      .where(eq(membershipTiers.id, tierId))
      .limit(1);

    if (!tier) return { success: false, error: 'Tier not found.' };

    await db.delete(membershipTiers).where(eq(membershipTiers.id, tierId));

    await logAudit({
      actor: user,
      action: 'deleted tier',
      targetType: 'tier',
      targetId: tier.id,
      targetLabel: tier.name,
    });

    revalidatePath('/admin/settings');
    revalidatePath('/admin/clients');
    return { success: true };
  } catch (error) {
    console.error('[deleteTier]', error);
    return { success: false, error: 'Failed to delete tier.' };
  }
}

// ---------------------------------------------------------------------------
// Email templates
// ---------------------------------------------------------------------------

export interface UpdateEmailTemplateInput {
  subject: string;
  body: string;
}

export async function updateEmailTemplate(
  templateId: string,
  input: UpdateEmailTemplateInput,
): Promise<ActionResult> {
  const user = await requireAdmin();

  if (!input.subject?.trim()) return { success: false, error: 'Subject is required.' };
  if (!input.body?.trim()) return { success: false, error: 'Body is required.' };

  try {
    const [updated] = await db
      .update(emailTemplates)
      .set({
        subject: input.subject.trim(),
        body: input.body.trim(),
        // user.staffId may be null for admins who aren't linked to a staff
        // row — the column is nullable, so that's fine.
        lastEditedBy: user.staffId,
      })
      .where(eq(emailTemplates.id, templateId))
      .returning({ id: emailTemplates.id, name: emailTemplates.name });

    if (!updated) return { success: false, error: 'Email template not found.' };

    await logAudit({
      actor: user,
      action: 'updated settings',
      targetType: 'settings',
      targetLabel: `Email template: ${updated.name}`,
      metadata: { templateId: updated.id },
    });

    revalidatePath('/admin/settings');
    return { success: true };
  } catch (error) {
    console.error('[updateEmailTemplate]', error);
    return { success: false, error: 'Failed to update email template.' };
  }
}
