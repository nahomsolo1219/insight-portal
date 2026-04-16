'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { clients } from '@/db/schema';
import { logAudit } from '@/lib/audit';
import { requireAdmin } from '@/lib/auth/current-user';

export interface CreateClientInput {
  name: string;
  email?: string;
  phone?: string;
  membershipTierId?: string;
  assignedPmId?: string;
  memberSince?: string; // YYYY-MM-DD
}

export type ActionResult<T = undefined> =
  | { success: true; data?: T }
  | { success: false; error: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateClient(input: CreateClientInput): string | null {
  const name = input.name?.trim() ?? '';
  if (!name) return 'Client name is required';
  if (name.length > 200) return 'Client name is too long';
  if (input.email && !EMAIL_RE.test(input.email.trim())) return 'Invalid email address';
  return null;
}

export async function createClient(
  input: CreateClientInput,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireAdmin();

  const validationError = validateClient(input);
  if (validationError) return { success: false, error: validationError };

  try {
    // Blank form fields become NULL, not '' — keeps `email IS NULL` queries
    // and mailto: link guards working as intended.
    const [newClient] = await db
      .insert(clients)
      .values({
        name: input.name.trim(),
        email: input.email?.trim() || null,
        phone: input.phone?.trim() || null,
        membershipTierId: input.membershipTierId || null,
        assignedPmId: input.assignedPmId || null,
        memberSince: input.memberSince || null,
        status: 'active',
      })
      .returning({ id: clients.id, name: clients.name });

    await logAudit({
      actor: user,
      action: 'created client',
      targetType: 'client',
      targetId: newClient.id,
      targetLabel: newClient.name,
      clientId: newClient.id,
    });

    // Dashboard "Recent Activity" + sidebar badges read this surface.
    revalidatePath('/admin/clients');
    revalidatePath('/admin');
    return { success: true, data: { id: newClient.id } };
  } catch (error) {
    console.error('[createClient]', error);
    return { success: false, error: 'Failed to create client. Please try again.' };
  }
}

export async function archiveClient(clientId: string): Promise<ActionResult> {
  const user = await requireAdmin();

  try {
    const [archived] = await db
      .update(clients)
      .set({ status: 'inactive', updatedAt: new Date() })
      .where(eq(clients.id, clientId))
      .returning({ id: clients.id, name: clients.name });

    if (!archived) return { success: false, error: 'Client not found' };

    await logAudit({
      actor: user,
      action: 'archived client',
      targetType: 'client',
      targetId: archived.id,
      targetLabel: archived.name,
      clientId: archived.id,
    });

    revalidatePath('/admin/clients');
    return { success: true };
  } catch (error) {
    console.error('[archiveClient]', error);
    return { success: false, error: 'Failed to archive client' };
  }
}
