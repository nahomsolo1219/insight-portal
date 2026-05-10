'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { companySettings, emailTemplates, membershipTiers } from '@/db/schema';
import { logAudit } from '@/lib/audit';
import { requireAdmin } from '@/lib/auth/current-user';
import { createAdminClient } from '@/lib/supabase/admin';
import { BUCKET_NAME } from '@/lib/storage/paths';

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

// ---------------------------------------------------------------------------
// Company settings
// ---------------------------------------------------------------------------

export interface CompanySettingsInput {
  firmName?: string;
  firmTagline?: string | null;
  firmEmail?: string | null;
  firmPhone?: string | null;
  firmAddress?: string | null;
  firmWebsite?: string | null;
  businessHours?: string | null;
  brandPrimaryColor?: string | null;
  brandAccentColor?: string | null;
  defaultInvoiceCategories?: string[] | null;
  emailFromName?: string | null;
  emailFromAddress?: string | null;
  emailReplyTo?: string | null;
}

export async function updateCompanySettings(
  input: CompanySettingsInput,
): Promise<ActionResult> {
  const user = await requireAdmin();

  try {
    // Get the single row's id.
    const [existing] = await db
      .select({ id: companySettings.id })
      .from(companySettings)
      .limit(1);
    if (!existing) return { success: false, error: 'Company settings row not found.' };

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (input.firmName !== undefined) patch.firmName = input.firmName.trim() || 'Insight Home Maintenance';
    if (input.firmTagline !== undefined) patch.firmTagline = input.firmTagline?.trim() || null;
    if (input.firmEmail !== undefined) patch.firmEmail = input.firmEmail?.trim() || null;
    if (input.firmPhone !== undefined) patch.firmPhone = input.firmPhone?.trim() || null;
    if (input.firmAddress !== undefined) patch.firmAddress = input.firmAddress?.trim() || null;
    if (input.firmWebsite !== undefined) patch.firmWebsite = input.firmWebsite?.trim() || null;
    if (input.businessHours !== undefined) patch.businessHours = input.businessHours?.trim() || null;
    if (input.brandPrimaryColor !== undefined) patch.brandPrimaryColor = input.brandPrimaryColor?.trim() || null;
    if (input.brandAccentColor !== undefined) patch.brandAccentColor = input.brandAccentColor?.trim() || null;
    if (input.defaultInvoiceCategories !== undefined) {
      patch.defaultInvoiceCategories = input.defaultInvoiceCategories;
    }
    if (input.emailFromName !== undefined) patch.emailFromName = input.emailFromName?.trim() || null;
    if (input.emailFromAddress !== undefined) patch.emailFromAddress = input.emailFromAddress?.trim() || null;
    if (input.emailReplyTo !== undefined) patch.emailReplyTo = input.emailReplyTo?.trim() || null;

    await db
      .update(companySettings)
      .set(patch)
      .where(eq(companySettings.id, existing.id));

    await logAudit({
      actor: user,
      action: 'updated settings',
      targetType: 'settings',
      targetLabel: 'Company settings',
    });

    revalidatePath('/admin/settings');
    revalidatePath('/admin');
    revalidatePath('/portal');
    return { success: true };
  } catch (error) {
    console.error('[updateCompanySettings]', error);
    return { success: false, error: 'Failed to update company settings.' };
  }
}

export async function uploadFirmLogo(
  formData: FormData,
  kind: 'light' | 'dark',
): Promise<ActionResult<{ url: string }>> {
  const user = await requireAdmin();

  const file = formData.get('file') as File | null;
  if (!file || file.size === 0) return { success: false, error: 'No file provided.' };
  if (file.size > 5 * 1024 * 1024) return { success: false, error: 'File must be under 5 MB.' };

  const allowedTypes = ['image/png', 'image/svg+xml', 'image/jpeg', 'image/webp'];
  if (!allowedTypes.includes(file.type)) {
    return { success: false, error: 'Logo must be PNG, SVG, JPEG, or WebP.' };
  }

  const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
  const storagePath = `company/logo-${kind}.${ext}`;

  try {
    const supabase = createAdminClient();
    const arrayBuffer = await file.arrayBuffer();
    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(storagePath, arrayBuffer, {
        contentType: file.type,
        upsert: true,
      });
    if (error) throw error;

    // Get public URL (the bucket is private, but admin always signs).
    // Store the path, not the URL — same as other file references.
    const [existing] = await db
      .select({ id: companySettings.id })
      .from(companySettings)
      .limit(1);
    if (!existing) return { success: false, error: 'Settings row not found.' };

    const field = kind === 'light' ? 'logoLightUrl' : 'logoDarkUrl';
    await db
      .update(companySettings)
      .set({ [field]: storagePath, updatedAt: new Date() })
      .where(eq(companySettings.id, existing.id));

    await logAudit({
      actor: user,
      action: 'updated settings',
      targetType: 'settings',
      targetLabel: `Uploaded ${kind} logo`,
    });

    revalidatePath('/admin/settings');
    revalidatePath('/admin');
    revalidatePath('/portal');
    return { success: true, data: { url: storagePath } };
  } catch (error) {
    console.error('[uploadFirmLogo]', error);
    return { success: false, error: 'Failed to upload logo.' };
  }
}

export async function removeFirmLogo(kind: 'light' | 'dark'): Promise<ActionResult> {
  const user = await requireAdmin();

  try {
    const [existing] = await db
      .select({ id: companySettings.id, logoLightUrl: companySettings.logoLightUrl, logoDarkUrl: companySettings.logoDarkUrl })
      .from(companySettings)
      .limit(1);
    if (!existing) return { success: false, error: 'Settings row not found.' };

    const path = kind === 'light' ? existing.logoLightUrl : existing.logoDarkUrl;
    if (path) {
      const supabase = createAdminClient();
      await supabase.storage.from(BUCKET_NAME).remove([path]);
    }

    const field = kind === 'light' ? 'logoLightUrl' : 'logoDarkUrl';
    await db
      .update(companySettings)
      .set({ [field]: null, updatedAt: new Date() })
      .where(eq(companySettings.id, existing.id));

    await logAudit({
      actor: user,
      action: 'updated settings',
      targetType: 'settings',
      targetLabel: `Removed ${kind} logo`,
    });

    revalidatePath('/admin/settings');
    revalidatePath('/admin');
    revalidatePath('/portal');
    return { success: true };
  } catch (error) {
    console.error('[removeFirmLogo]', error);
    return { success: false, error: 'Failed to remove logo.' };
  }
}

export async function resetBrandColors(): Promise<ActionResult> {
  const user = await requireAdmin();

  try {
    const [existing] = await db
      .select({ id: companySettings.id })
      .from(companySettings)
      .limit(1);
    if (!existing) return { success: false, error: 'Settings row not found.' };

    await db
      .update(companySettings)
      .set({ brandPrimaryColor: null, brandAccentColor: null, updatedAt: new Date() })
      .where(eq(companySettings.id, existing.id));

    await logAudit({
      actor: user,
      action: 'updated settings',
      targetType: 'settings',
      targetLabel: 'Reset brand colors to defaults',
    });

    revalidatePath('/admin/settings');
    revalidatePath('/admin');
    revalidatePath('/portal');
    return { success: true };
  } catch (error) {
    console.error('[resetBrandColors]', error);
    return { success: false, error: 'Failed to reset brand colors.' };
  }
}
