'use server';

import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { profiles, staff } from '@/db/schema';
import { logAudit } from '@/lib/audit';
import { requireAdmin } from '@/lib/auth/current-user';

type ActionResult<T = undefined> =
  | { success: true; data?: T }
  | { success: false; error: string };

export type StaffRole =
  | 'founder'
  | 'project_manager'
  | 'field_lead'
  | 'field_tech'
  | 'admin_assistant';

export type StaffStatus = 'active' | 'pending' | 'inactive';

// Service-role client. Bypasses RLS — only use from admin-gated Server Actions,
// and never expose the service role key to the browser.
function adminClient() {
  return createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export type InviteRole = 'admin' | 'client' | 'field_staff';

export interface InviteUserParams {
  email: string;
  fullName: string;
  role: InviteRole;
  /** Required when role === 'client'. Links the profile to the client record. */
  clientId?: string;
  /** Optional for admin / field_staff. Links the profile to a staff record. */
  staffId?: string;
}

export interface InviteUserResult {
  success: boolean;
  error?: string;
  userId?: string;
}

/**
 * Invite a new user to the portal. Only callable by admins.
 *
 * Flow:
 *  1. Supabase Auth sends the invite email and creates the auth.users row.
 *  2. Our on_auth_user_created trigger creates the matching public.profiles row
 *     using the full_name + role we pass in user_metadata.
 *  3. We follow up with an UPDATE to link the profile to a client or staff row
 *     when applicable (the trigger doesn't know about those FKs).
 */
export async function inviteUser(params: InviteUserParams): Promise<InviteUserResult> {
  await requireAdmin();

  if (params.role === 'client' && !params.clientId) {
    return { success: false, error: 'clientId is required when inviting a client user.' };
  }

  const admin = adminClient();
  // Invitees land on the password-setup page so their first action is
  // choosing a credential — after which they can use email+password
  // for subsequent sign-ins without always going through magic links.
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  const redirectTo = `${siteUrl}/auth/callback?next=/auth/reset-password`;

  const { data, error } = await admin.auth.admin.inviteUserByEmail(params.email, {
    data: {
      full_name: params.fullName,
      role: params.role,
    },
    redirectTo,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  if (data.user && (params.clientId || params.staffId)) {
    await db
      .update(profiles)
      .set({
        clientId: params.clientId ?? null,
        staffId: params.staffId ?? null,
        updatedAt: new Date(),
      })
      .where(eq(profiles.id, data.user.id));
  }

  revalidatePath('/admin/staff');
  revalidatePath('/admin/clients');

  return { success: true, userId: data.user?.id };
}

// ---------------------------------------------------------------------------
// Staff directory CRUD
// ---------------------------------------------------------------------------

export interface CreateStaffInput {
  name: string;
  role: StaffRole;
  email: string;
  phone?: string | null;
  /**
   * When true, also call `inviteUser` to send the Supabase invite email
   * and link the resulting profile row to the new staff record.
   */
  sendInvite?: boolean;
}

/**
 * Insert a staff row. If `sendInvite` is true we follow up by dispatching
 * the Supabase invite email — failure to email doesn't roll back the
 * staff row (David can always resend the invite manually).
 */
export async function createStaffMember(
  input: CreateStaffInput,
): Promise<ActionResult<{ id: string; inviteSent: boolean; inviteError?: string }>> {
  const user = await requireAdmin();

  if (!input.name?.trim()) return { success: false, error: 'Name is required.' };
  if (!input.email?.trim()) return { success: false, error: 'Email is required.' };

  try {
    const [member] = await db
      .insert(staff)
      .values({
        name: input.name.trim(),
        role: input.role,
        email: input.email.trim(),
        phone: input.phone?.trim() || null,
        // Row starts `active` if there's no invite; otherwise `pending`
        // until the invitee accepts and the profile trigger fires.
        status: input.sendInvite ? 'pending' : 'active',
      })
      .returning({ id: staff.id, name: staff.name });

    await logAudit({
      actor: user,
      action: 'invited staff',
      targetType: 'staff',
      targetId: member.id,
      targetLabel: member.name,
      metadata: { role: input.role, sendInvite: Boolean(input.sendInvite) },
    });

    let inviteSent = false;
    let inviteError: string | undefined;
    if (input.sendInvite) {
      const inviteRole: InviteRole =
        input.role === 'field_lead' || input.role === 'field_tech' ? 'field_staff' : 'admin';
      const result = await inviteUser({
        email: input.email.trim(),
        fullName: input.name.trim(),
        role: inviteRole,
        staffId: member.id,
      });
      inviteSent = result.success;
      if (!result.success) inviteError = result.error;
    }

    revalidatePath('/admin/staff');
    return { success: true, data: { id: member.id, inviteSent, inviteError } };
  } catch (error) {
    console.error('[createStaffMember]', error);
    return { success: false, error: 'Failed to add staff member.' };
  }
}

export interface UpdateStaffInput {
  name: string;
  role: StaffRole;
  email: string;
  phone?: string | null;
  status: StaffStatus;
}

export async function updateStaffMember(
  staffId: string,
  input: UpdateStaffInput,
): Promise<ActionResult> {
  const user = await requireAdmin();

  if (!input.name?.trim()) return { success: false, error: 'Name is required.' };
  if (!input.email?.trim()) return { success: false, error: 'Email is required.' };

  try {
    const [updated] = await db
      .update(staff)
      .set({
        name: input.name.trim(),
        role: input.role,
        email: input.email.trim(),
        phone: input.phone?.trim() || null,
        status: input.status,
      })
      .where(eq(staff.id, staffId))
      .returning({ id: staff.id, name: staff.name });

    if (!updated) return { success: false, error: 'Staff member not found.' };

    await logAudit({
      actor: user,
      action: 'updated staff',
      targetType: 'staff',
      targetId: updated.id,
      targetLabel: updated.name,
      metadata: { role: input.role, status: input.status },
    });

    revalidatePath('/admin/staff');
    return { success: true };
  } catch (error) {
    console.error('[updateStaffMember]', error);
    return { success: false, error: 'Failed to update staff member.' };
  }
}
