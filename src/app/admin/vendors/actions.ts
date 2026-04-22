'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { vendors } from '@/db/schema';
import { logAudit } from '@/lib/audit';
import { requireAdmin } from '@/lib/auth/current-user';

type ActionResult<T = undefined> =
  | { success: true; data?: T }
  | { success: false; error: string };

export interface VendorInput {
  name: string;
  category: string;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
}

/**
 * Create a vendor. Rating + jobsCompleted start at zero — both are
 * manually curated by David over time.
 */
export async function createVendor(
  input: VendorInput,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireAdmin();

  if (!input.name?.trim()) return { success: false, error: 'Vendor name is required.' };
  if (!input.category?.trim()) return { success: false, error: 'Category is required.' };

  try {
    const [vendor] = await db
      .insert(vendors)
      .values({
        name: input.name.trim(),
        category: input.category.trim(),
        phone: input.phone?.trim() || null,
        email: input.email?.trim() || null,
        notes: input.notes?.trim() || null,
        active: true,
        rating: 0,
        jobsCompleted: 0,
      })
      .returning({ id: vendors.id, name: vendors.name });

    await logAudit({
      actor: user,
      action: 'added vendor',
      targetType: 'vendor',
      targetId: vendor.id,
      targetLabel: vendor.name,
    });

    revalidatePath('/admin/vendors');
    return { success: true, data: { id: vendor.id } };
  } catch (error) {
    console.error('[createVendor]', error);
    return { success: false, error: 'Failed to create vendor.' };
  }
}

export async function updateVendor(
  vendorId: string,
  input: VendorInput,
): Promise<ActionResult> {
  const user = await requireAdmin();

  if (!input.name?.trim()) return { success: false, error: 'Vendor name is required.' };
  if (!input.category?.trim()) return { success: false, error: 'Category is required.' };

  try {
    const [updated] = await db
      .update(vendors)
      .set({
        name: input.name.trim(),
        category: input.category.trim(),
        phone: input.phone?.trim() || null,
        email: input.email?.trim() || null,
        notes: input.notes?.trim() || null,
      })
      .where(eq(vendors.id, vendorId))
      .returning({ id: vendors.id, name: vendors.name });

    if (!updated) return { success: false, error: 'Vendor not found.' };

    await logAudit({
      actor: user,
      action: 'updated vendor',
      targetType: 'vendor',
      targetId: updated.id,
      targetLabel: updated.name,
    });

    revalidatePath('/admin/vendors');
    return { success: true };
  } catch (error) {
    console.error('[updateVendor]', error);
    return { success: false, error: 'Failed to update vendor.' };
  }
}

/**
 * Flip active flag. Keeps the row so assignments and historical audit
 * entries keep their relation; inactive vendors just drop out of the
 * "Assign vendor" pickers around the app.
 */
export async function toggleVendorActive(vendorId: string): Promise<ActionResult> {
  const user = await requireAdmin();

  try {
    const [vendor] = await db
      .select({ id: vendors.id, name: vendors.name, active: vendors.active })
      .from(vendors)
      .where(eq(vendors.id, vendorId))
      .limit(1);

    if (!vendor) return { success: false, error: 'Vendor not found.' };

    await db.update(vendors).set({ active: !vendor.active }).where(eq(vendors.id, vendorId));

    await logAudit({
      actor: user,
      action: 'updated vendor',
      targetType: 'vendor',
      targetId: vendor.id,
      targetLabel: `${vendor.name} → ${vendor.active ? 'inactive' : 'active'}`,
      metadata: { field: 'active', from: vendor.active, to: !vendor.active },
    });

    revalidatePath('/admin/vendors');
    return { success: true };
  } catch (error) {
    console.error('[toggleVendorActive]', error);
    return { success: false, error: 'Failed to update vendor.' };
  }
}
