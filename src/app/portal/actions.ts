'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { clients } from '@/db/schema';
import { logAudit } from '@/lib/audit';
import { requireUser } from '@/lib/auth/current-user';

type ActionResult = { success: true } | { success: false; error: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface UpdateMyProfileInput {
  name?: string;
  email?: string;
  phone?: string | null;
}

/**
 * Client self-service: update name / email / phone on the owning client
 * row. Members can NOT touch tier, PM, properties, or member-since —
 * those stay admin-controlled.
 *
 * Drizzle uses the `DATABASE_URL` pooled connection which authenticates
 * as the `postgres` role and bypasses RLS, so this UPDATE always
 * succeeds. Security boundary: `requireUser` + the in-code ownership
 * check via `user.clientId`. A client can only write to the clients row
 * their own profile is linked to.
 */
export async function updateMyProfile(input: UpdateMyProfileInput): Promise<ActionResult> {
  const user = await requireUser();
  if (user.role !== 'client') {
    return { success: false, error: 'Only clients can update their profile here.' };
  }
  if (!user.clientId) {
    return { success: false, error: 'No client profile linked to this account.' };
  }

  // Field-level validation. Empty strings collapse to NULL for phone so
  // tel: links don't render against blanks.
  if (input.name !== undefined && !input.name.trim()) {
    return { success: false, error: 'Name cannot be empty.' };
  }
  if (input.email !== undefined) {
    const trimmed = input.email.trim();
    if (!trimmed) return { success: false, error: 'Email cannot be empty.' };
    if (!EMAIL_RE.test(trimmed)) return { success: false, error: 'Invalid email address.' };
  }

  const updates: Record<string, unknown> = {};
  if (input.name !== undefined) updates.name = input.name.trim();
  if (input.email !== undefined) updates.email = input.email.trim();
  if (input.phone !== undefined) updates.phone = input.phone?.trim() || null;

  if (Object.keys(updates).length === 0) return { success: true };

  // Touch updatedAt explicitly — the column has defaultNow() at insert
  // but Drizzle won't bump it automatically on update.
  updates.updatedAt = new Date();

  try {
    await db.update(clients).set(updates).where(eq(clients.id, user.clientId));

    await logAudit({
      actor: user,
      action: 'updated client',
      targetType: 'client',
      targetId: user.clientId,
      targetLabel: typeof updates.name === 'string' ? updates.name : 'self-edit',
      clientId: user.clientId,
      metadata: { source: 'portal-self-service' },
    });

    // Revalidate the entire portal tree — the client name + avatar
    // surface in the landing card, the per-property PortalSidebar
    // profile row, and the dashboard greeting. Layout-level
    // invalidation is the simplest way to catch all three.
    revalidatePath('/portal', 'layout');
    return { success: true };
  } catch (error) {
    console.error('[updateMyProfile]', error);
    return { success: false, error: 'Failed to update profile.' };
  }
}
