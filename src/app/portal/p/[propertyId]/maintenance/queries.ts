// Portal-side queries for the maintenance section. Reads active + past
// maintenance plans for a given property, scoped by clientId for defence
// in depth on top of RLS.

import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import {
  maintenancePlans,
  maintenanceVisitScopeItems,
  maintenanceVisits,
  properties,
  vendors,
} from '@/db/schema';
import { getSignedUrl } from '@/lib/storage/upload';

export interface MaintenanceScopeItem {
  id: string;
  scopeType: string;
  customLabel: string | null;
  completed: boolean;
  completionNotes: string | null;
  itemOrder: number;
}

export interface MaintenanceVisitRow {
  id: string;
  title: string;
  scheduledDate: string;
  status: string;
  visitOrder: number;
  vendorName: string | null;
  notes: string | null;
  completedAt: Date | null;
  scopeItems: MaintenanceScopeItem[];
}

export interface MaintenancePlanRow {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: string;
  billingTotalCents: number | null;
  billingCadence: string | null;
  notes: string | null;
  homeAssessmentUrl: string | null;
  playbookUrl: string | null;
  visits: MaintenanceVisitRow[];
}

/**
 * Fetch active maintenance plans for a property. Includes visits + scope
 * items so the page can render the full quarterly breakdown in one read.
 */
export async function getActiveMaintenancePlans(
  clientId: string,
  propertyId: string,
): Promise<MaintenancePlanRow[]> {
  return getPlans(clientId, propertyId, ['active']);
}

/**
 * Fetch past (archived/completed) maintenance plans for a property.
 */
export async function getPastMaintenancePlans(
  clientId: string,
  propertyId: string,
): Promise<MaintenancePlanRow[]> {
  return getPlans(clientId, propertyId, ['archived', 'completed']);
}

async function getPlans(
  clientId: string,
  propertyId: string,
  statuses: string[],
): Promise<MaintenancePlanRow[]> {
  // Ownership check: property belongs to client.
  const [property] = await db
    .select({ id: properties.id })
    .from(properties)
    .where(and(eq(properties.id, propertyId), eq(properties.clientId, clientId)))
    .limit(1);
  if (!property) return [];

  const plans = await db
    .select({
      id: maintenancePlans.id,
      name: maintenancePlans.name,
      startDate: maintenancePlans.startDate,
      endDate: maintenancePlans.endDate,
      status: maintenancePlans.status,
      billingTotalCents: maintenancePlans.billingTotalCents,
      billingCadence: maintenancePlans.billingCadence,
      notes: maintenancePlans.notes,
      homeAssessmentUrl: maintenancePlans.homeAssessmentUrl,
      playbookUrl: maintenancePlans.playbookUrl,
    })
    .from(maintenancePlans)
    .where(
      and(
        eq(maintenancePlans.propertyId, propertyId),
        inArray(maintenancePlans.status, statuses),
      ),
    )
    .orderBy(desc(maintenancePlans.startDate));

  if (plans.length === 0) return [];

  const planIds = plans.map((p) => p.id);

  // Fetch all visits for these plans in one query.
  const visitRows = await db
    .select({
      id: maintenanceVisits.id,
      planId: maintenanceVisits.planId,
      title: maintenanceVisits.title,
      scheduledDate: maintenanceVisits.scheduledDate,
      status: maintenanceVisits.status,
      visitOrder: maintenanceVisits.visitOrder,
      vendorName: vendors.name,
      notes: maintenanceVisits.notes,
      completedAt: maintenanceVisits.completedAt,
    })
    .from(maintenanceVisits)
    .leftJoin(vendors, eq(vendors.id, maintenanceVisits.vendorId))
    .where(inArray(maintenanceVisits.planId, planIds))
    .orderBy(asc(maintenanceVisits.visitOrder));

  const visitIds = visitRows.map((v) => v.id);

  // Fetch all scope items for all visits in one query.
  const scopeRows =
    visitIds.length === 0
      ? []
      : await db
          .select({
            id: maintenanceVisitScopeItems.id,
            visitId: maintenanceVisitScopeItems.visitId,
            scopeType: maintenanceVisitScopeItems.scopeType,
            customLabel: maintenanceVisitScopeItems.customLabel,
            completed: maintenanceVisitScopeItems.completed,
            completionNotes: maintenanceVisitScopeItems.completionNotes,
            itemOrder: maintenanceVisitScopeItems.itemOrder,
          })
          .from(maintenanceVisitScopeItems)
          .where(inArray(maintenanceVisitScopeItems.visitId, visitIds))
          .orderBy(asc(maintenanceVisitScopeItems.itemOrder));

  // Group scope items by visit.
  const scopeByVisit = new Map<string, MaintenanceScopeItem[]>();
  for (const s of scopeRows) {
    const existing = scopeByVisit.get(s.visitId) ?? [];
    existing.push({
      id: s.id,
      scopeType: s.scopeType,
      customLabel: s.customLabel,
      completed: s.completed,
      completionNotes: s.completionNotes,
      itemOrder: s.itemOrder,
    });
    scopeByVisit.set(s.visitId, existing);
  }

  // Group visits by plan.
  const visitsByPlan = new Map<string, MaintenanceVisitRow[]>();
  for (const v of visitRows) {
    const existing = visitsByPlan.get(v.planId) ?? [];
    existing.push({
      id: v.id,
      title: v.title,
      scheduledDate: v.scheduledDate,
      status: v.status,
      visitOrder: v.visitOrder,
      vendorName: v.vendorName,
      notes: v.notes,
      completedAt: v.completedAt,
      scopeItems: scopeByVisit.get(v.id) ?? [],
    });
    visitsByPlan.set(v.planId, existing);
  }

  return plans.map((p) => ({
    ...p,
    visits: visitsByPlan.get(p.id) ?? [],
  }));
}

/**
 * Generate signed URLs for a plan's playbook and home assessment documents.
 * Returns null for each if not uploaded.
 */
export async function getPlanDocumentUrls(plan: {
  homeAssessmentUrl: string | null;
  playbookUrl: string | null;
}): Promise<{ homeAssessmentSignedUrl: string | null; playbookSignedUrl: string | null }> {
  const [homeAssessmentSignedUrl, playbookSignedUrl] = await Promise.all([
    plan.homeAssessmentUrl ? getSignedUrl(plan.homeAssessmentUrl).catch(() => null) : null,
    plan.playbookUrl ? getSignedUrl(plan.playbookUrl).catch(() => null) : null,
  ]);
  return { homeAssessmentSignedUrl, playbookSignedUrl };
}
