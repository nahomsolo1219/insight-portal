'use server';

import { and, count, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { milestones, projects } from '@/db/schema';
import { logAudit } from '@/lib/audit';
import { requireAdmin } from '@/lib/auth/current-user';

type ActionResult = { success: true } | { success: false; error: string };

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
