'use server';

import { and, count, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { milestones, projects, properties } from '@/db/schema';
import { logAudit } from '@/lib/audit';
import { requireAdmin } from '@/lib/auth/current-user';

type ActionResult = { success: true } | { success: false; error: string };

/**
 * Close out a decision that the client has already answered. Flips
 * `milestones.status` from `awaiting_client` → `complete`, recomputes
 * the parent project's progress, and audits the action.
 *
 * Pre-conditions enforced:
 *   - milestone exists
 *   - milestone.status === 'awaiting_client'
 *   - milestone.clientResponse IS NOT NULL  (i.e. it actually belongs
 *     in the "Needs your review" bucket)
 */
export async function markDecisionComplete(milestoneId: string): Promise<ActionResult> {
  const user = await requireAdmin();

  try {
    const [existing] = await db
      .select({
        id: milestones.id,
        title: milestones.title,
        status: milestones.status,
        projectId: milestones.projectId,
        clientResponse: milestones.clientResponse,
        clientId: properties.clientId,
      })
      .from(milestones)
      .innerJoin(projects, eq(projects.id, milestones.projectId))
      .innerJoin(properties, eq(properties.id, projects.propertyId))
      .where(eq(milestones.id, milestoneId))
      .limit(1);

    if (!existing) return { success: false, error: 'Milestone not found.' };
    if (existing.status !== 'awaiting_client') {
      return { success: false, error: 'This decision has already been closed out.' };
    }
    if (!existing.clientResponse) {
      return { success: false, error: 'Client has not responded yet.' };
    }

    await db
      .update(milestones)
      .set({ status: 'complete', updatedAt: new Date() })
      .where(eq(milestones.id, milestoneId));

    // Recompute project progress so the percentage stays in sync — same
    // pattern as toggleMilestoneComplete in clients/[id]/actions.ts.
    const [totalRow] = await db
      .select({ count: count() })
      .from(milestones)
      .where(eq(milestones.projectId, existing.projectId));
    const [doneRow] = await db
      .select({ count: count() })
      .from(milestones)
      .where(
        and(eq(milestones.projectId, existing.projectId), eq(milestones.status, 'complete')),
      );

    const total = Number(totalRow?.count ?? 0);
    const done = Number(doneRow?.count ?? 0);
    const progress = total === 0 ? 0 : Math.round((done / total) * 100);

    await db
      .update(projects)
      .set({ progress, updatedAt: new Date() })
      .where(eq(projects.id, existing.projectId));

    await logAudit({
      actor: user,
      action: 'marked milestone complete',
      targetType: 'milestone',
      targetId: existing.id,
      targetLabel: existing.title,
      clientId: existing.clientId,
    });

    // TODO(notifications): optionally fire a 'decision_completed'
    // notification to the client when David closes out a decision. Needs
    // a new NotificationKind in src/lib/notifications/create.ts plus a
    // title/icon entry in NotificationsDropdown. Skipped here to keep the
    // commit lean — the client already has visual confirmation via the
    // milestone status flip on their project timeline.

    revalidatePath('/admin/decisions');
    revalidatePath('/admin');
    revalidatePath(`/admin/clients/${existing.clientId}`);
    return { success: true };
  } catch (error) {
    console.error('[markDecisionComplete]', error);
    return { success: false, error: 'Failed to mark decision complete.' };
  }
}
