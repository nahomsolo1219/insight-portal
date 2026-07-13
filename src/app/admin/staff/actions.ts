'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { profiles, staff } from '@/db/schema';
import { logAudit } from '@/lib/audit';
import { requireAdmin } from '@/lib/auth/current-user';
import { sendEmail } from '@/lib/email/send';
import type { SendEmailResult } from '@/lib/email/types';
import { getWelcomeEmailVars } from '@/lib/email/variables';
import { createAdminClient } from '@/lib/supabase/admin';

type ActionResult<T = undefined> =
  | { success: true; data?: T }
  | { success: false; error: string };

export type StaffRole =
  | 'founder'
  | 'project_manager'
  | 'field_staff'
  | 'admin_assistant';

export type StaffStatus = 'active' | 'pending' | 'inactive';


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
  /** True when the auth user exists (freshly created, or already existed on a
   *  resend) AND we generated a link for them. */
  success: boolean;
  /** Set only when success=false (we could not create the user / generate a link). */
  error?: string;
  userId?: string;
  /** Whether the branded invite email actually went out via Resend. When this
   *  is false the user EXISTS but nobody was notified — the caller must surface
   *  a "resend" path. */
  emailSent?: boolean;
  emailError?: string;
}

/** Supabase returns this (varying by version) when generateLink type:'invite'
 *  hits an email that's already registered — the signal to fall back to a
 *  recovery link for the resend/re-invite path. */
function isAlreadyRegistered(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: string }).code ?? '';
  const message = ((error as { message?: string }).message ?? '').toLowerCase();
  return (
    code === 'email_exists' ||
    code === 'user_already_exists' ||
    message.includes('already been registered') ||
    message.includes('already registered') ||
    message.includes('already exists')
  );
}

/**
 * Invite a user to the portal (or resend an invite). Only callable by admins.
 *
 * We take over the auth email from Supabase: `generateLink` CREATES the user
 * and RETURNS the link WITHOUT sending anything, then we send our own branded
 * email (via Resend) carrying that real link. This replaces the old
 * `inviteUserByEmail`, which sent Supabase's unbranded email AND created the
 * user — you can't suppress its email.
 *
 * Flow:
 *  1. `generateLink({ type: 'invite', data: { role, full_name } })` — creates
 *     the auth.users row with role/full_name in user_metadata (the profile
 *     trigger reads role, so an invited client lands role='client'), and
 *     returns `properties.action_link`.
 *  2. On a resend (user already exists → invite errors), fall back to a
 *     `recovery` link, which also lands on the password-set page.
 *  3. Link the profile to the client/staff row (trigger doesn't know the FKs).
 *  4. Send the branded email carrying `action_link` as the CTA. Every role
 *     gets one — clients get `welcome_client`, everyone else `staff_invite` —
 *     so disabling Supabase's emails never leaves a role with no way to onboard.
 */
export async function inviteUser(params: InviteUserParams): Promise<InviteUserResult> {
  await requireAdmin();

  if (params.role === 'client' && !params.clientId) {
    return { success: false, error: 'clientId is required when inviting a client user.' };
  }

  const admin = createAdminClient();
  // Invitees land on the password-setup page so their first action is choosing
  // a credential; after that they can use email+password. The reset-password
  // page routes them by role once the password is set (don't regress that).
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  const redirectTo = `${siteUrl}/auth/callback?next=/auth/reset-password`;

  // Create the user + get the link WITHOUT sending Supabase's own email.
  let gen = await admin.auth.admin.generateLink({
    type: 'invite',
    email: params.email,
    options: {
      data: { full_name: params.fullName, role: params.role },
      redirectTo,
    },
  });

  // Resend / re-invite: type:'invite' errors when the email already exists. A
  // recovery link also lands on the password-set page, so it works as a fresh
  // "set your password" link for a user who hasn't onboarded yet.
  if (gen.error && isAlreadyRegistered(gen.error)) {
    gen = await admin.auth.admin.generateLink({
      type: 'recovery',
      email: params.email,
      options: { redirectTo },
    });
  }

  if (gen.error || !gen.data?.properties?.action_link) {
    return {
      success: false,
      error: gen.error?.message ?? 'Failed to generate the invite link.',
    };
  }

  const actionLink = gen.data.properties.action_link;
  const user = gen.data.user;

  if (user && (params.clientId || params.staffId)) {
    await db
      .update(profiles)
      .set({
        clientId: params.clientId ?? null,
        staffId: params.staffId ?? null,
        updatedAt: new Date(),
      })
      .where(eq(profiles.id, user.id));
  }

  // Send the branded email carrying the REAL link. The user already exists at
  // this point, so a failed send is NOT a rollback — it's surfaced to the
  // admin (emailSent=false) so they can resend.
  let emailResult: SendEmailResult;
  if (params.role === 'client' && params.clientId) {
    const vars = await getWelcomeEmailVars(params.clientId);
    emailResult = await sendEmail({
      key: 'welcome_client',
      to: params.email,
      recipientUserId: user?.id ?? null,
      // Override the /portal cta_url with the real password-set link.
      variables: { ...vars, cta_url: actionLink },
    });
  } else {
    emailResult = await sendEmail({
      key: 'staff_invite',
      to: params.email,
      recipientUserId: user?.id ?? null,
      variables: { user_name: params.fullName, cta_url: actionLink },
    });
  }

  revalidatePath('/admin/staff');
  revalidatePath('/admin/clients');

  return {
    success: true,
    userId: user?.id,
    emailSent: emailResult.success,
    emailError: emailResult.success ? undefined : emailResult.error,
  };
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
      // Auth roles are coarser than HR roles: every founder /
      // project_manager / admin_assistant gets `admin` access; field
      // staff get `field_staff`. Now that the staff_role enum has a
      // single field value, the mapping is a direct equality.
      const inviteRole: InviteRole = input.role === 'field_staff' ? 'field_staff' : 'admin';
      const result = await inviteUser({
        email: input.email.trim(),
        fullName: input.name.trim(),
        role: inviteRole,
        staffId: member.id,
      });
      // "Sent" means the branded email actually went out. The user may have
      // been created while the email failed — surface that so the admin resends.
      inviteSent = result.success && result.emailSent === true;
      if (!result.success) {
        inviteError = result.error;
      } else if (!result.emailSent) {
        inviteError = result.emailError ?? 'The invite email failed to send.';
      }
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
