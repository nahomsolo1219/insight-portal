// Queries that feed shared admin chrome (sidebar badges, header chips).
// The admin layout fetches them once per request and threads the counts
// through to `<Sidebar>`.

import { count, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { invoices, milestones, photos } from '@/db/schema';

export interface SidebarCounts {
  photosPending: number;
  decisionsPending: number;
  invoicesUnpaid: number;
}

/**
 * Counts of the three queues that drive sidebar badges:
 *   - photos awaiting categorization
 *   - milestones awaiting client response
 *   - invoices that are unpaid or partially paid
 * Run as three lightweight COUNT queries in parallel.
 */
export async function getSidebarCounts(): Promise<SidebarCounts> {
  const [[photoRow], [decisionRow], [invoiceRow]] = await Promise.all([
    db.select({ c: count() }).from(photos).where(eq(photos.status, 'pending')),
    db.select({ c: count() }).from(milestones).where(eq(milestones.status, 'awaiting_client')),
    db.select({ c: count() }).from(invoices).where(inArray(invoices.status, ['unpaid', 'partial'])),
  ]);

  return {
    photosPending: photoRow?.c ?? 0,
    decisionsPending: decisionRow?.c ?? 0,
    invoicesUnpaid: invoiceRow?.c ?? 0,
  };
}
