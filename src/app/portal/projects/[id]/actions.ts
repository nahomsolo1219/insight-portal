'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { milestones, projects, properties } from '@/db/schema';
import { logAudit } from '@/lib/audit';
import { requireUser } from '@/lib/auth/current-user';

type ActionResult = { success: true } | { success: false; error: string };

const MAX_RESPONSE_LENGTH = 2_000;

/**
 * Persist a client's response to an awaiting-client milestone (a "decision"
 * in portal language). Deliberately leaves the status as `awaiting_client`
 * — David reviews the response and marks it complete, which is when the
 * project's progress percentage actually moves. This way an accidental tap
 * never advances the project on the admin side without human review.
 *
 * Authorization: only the client who owns the project can respond. Two
 * checks: (1) `requireUser` must be a `client`, (2) the milestone must
 * belong to a project on a property owned by this client. Belt + braces.
 */
export async function respondToDecision(
  milestoneId: string,
  response: string,
): Promise<ActionResult> {
  const user = await requireUser();
  if (user.role !== 'client' || !user.clientId) {
    return { success: false, error: 'Only clients can respond to decisions.' };
  }

  const trimmed = response.trim();
  if (!trimmed) return { success: false, error: 'Please provide a response.' };
  if (trimmed.length > MAX_RESPONSE_LENGTH) {
    return { success: false, error: 'Response is too long.' };
  }

  try {
    // Fetch + ownership check in one round-trip. The join walks
    // milestone → project → property; matching on `properties.client_id`
    // catches a forged URL trying to hit someone else's milestone.
    const [row] = await db
      .select({
        id: milestones.id,
        status: milestones.status,
        clientResponse: milestones.clientResponse,
        title: milestones.title,
      })
      .from(milestones)
      .innerJoin(projects, eq(projects.id, milestones.projectId))
      .innerJoin(properties, eq(properties.id, projects.propertyId))
      .where(eq(milestones.id, milestoneId))
      .limit(1);

    if (!row) return { success: false, error: 'Decision not found.' };
    if (row.status !== 'awaiting_client') {
      return { success: false, error: 'This decision has already been resolved.' };
    }
    if (row.clientResponse) {
      return { success: false, error: 'You\u2019ve already responded to this decision.' };
    }

    await db
      .update(milestones)
      .set({
        clientResponse: trimmed,
        respondedAt: new Date(),
        respondedBy: user.id,
      })
      .where(eq(milestones.id, milestoneId));

    await logAudit({
      actor: user,
      action: 'responded to decision',
      targetType: 'milestone',
      targetId: row.id,
      targetLabel: row.title,
      clientId: user.clientId,
      metadata: { response: trimmed },
    });

    revalidatePath('/portal/projects');
    return { success: true };
  } catch (error) {
    console.error('[respondToDecision]', error);
    return { success: false, error: 'Failed to submit response.' };
  }
}
