// Shared queries for the maintenance-plan surface. Used by the admin
// section under /admin/maintenance and intended for the client portal
// when Session B-2 wires up the read-only client-facing view.
//
// Pure reads — no auth checks, no revalidation. Callers are
// responsible for `requireAdmin()` / `requireUser()` and any
// per-client scoping (RLS is the second line of defence).

import 'server-only';

import { asc, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import {
  clients,
  maintenancePlans,
  maintenanceVisits,
  maintenanceVisitScopeItems,
  properties,
  vendors,
} from '@/db/schema';

// Re-export the pure vocabulary so server-side callers that import
// `@/lib/maintenance/queries` get the constants alongside the read
// helpers. Client components should import from `./constants`
// directly to avoid pulling the postgres driver into the browser
// bundle.
export {
  PLAN_STATUSES,
  VISIT_STATUSES,
  BILLING_CADENCES,
} from './constants';
export type { PlanStatus, VisitStatus, BillingCadence } from './constants';

export interface PlanListRow {
  id: string;
  name: string;
  status: string;
  startDate: string;
  endDate: string;
  billingTotalCents: number | null;
  billingCadence: string | null;
  propertyId: string;
  propertyName: string;
  clientId: string;
  clientName: string;
  visitCount: number;
  completedVisitCount: number;
}

/**
 * List every plan with denormalised property + client + visit counts.
 * The admin list page filters/sorts in-memory off this set; the table
 * fits comfortably in one round-trip even at hundreds of plans because
 * each plan is a small row and the join graph is shallow.
 */
export async function listPlans(): Promise<PlanListRow[]> {
  const rows = await db
    .select({
      id: maintenancePlans.id,
      name: maintenancePlans.name,
      status: maintenancePlans.status,
      startDate: maintenancePlans.startDate,
      endDate: maintenancePlans.endDate,
      billingTotalCents: maintenancePlans.billingTotalCents,
      billingCadence: maintenancePlans.billingCadence,
      propertyId: properties.id,
      propertyName: properties.name,
      clientId: clients.id,
      clientName: clients.name,
    })
    .from(maintenancePlans)
    .innerJoin(properties, eq(properties.id, maintenancePlans.propertyId))
    .innerJoin(clients, eq(clients.id, properties.clientId))
    .orderBy(desc(maintenancePlans.startDate));

  if (rows.length === 0) return [];

  // One follow-up read for visit aggregates — keeping it as a separate
  // query keeps the main row shape readable, and Postgres serves the
  // aggregate from the (plan_id, visit_order) index.
  const planIds = rows.map((r) => r.id);
  const visitRows = await db
    .select({
      planId: maintenanceVisits.planId,
      status: maintenanceVisits.status,
    })
    .from(maintenanceVisits)
    .where(inArray(maintenanceVisits.planId, planIds));

  const visitsByPlan = new Map<string, { total: number; completed: number }>();
  for (const v of visitRows) {
    const acc = visitsByPlan.get(v.planId) ?? { total: 0, completed: 0 };
    acc.total += 1;
    if (v.status === 'completed') acc.completed += 1;
    visitsByPlan.set(v.planId, acc);
  }

  return rows.map((r) => {
    const counts = visitsByPlan.get(r.id) ?? { total: 0, completed: 0 };
    return {
      ...r,
      visitCount: counts.total,
      completedVisitCount: counts.completed,
    };
  });
}

export interface PlanDetail {
  id: string;
  name: string;
  status: string;
  startDate: string;
  endDate: string;
  billingTotalCents: number | null;
  billingCadence: string | null;
  notes: string | null;
  homeAssessmentUrl: string | null;
  playbookUrl: string | null;
  propertyId: string;
  propertyName: string;
  propertyAddress: string;
  clientId: string;
  clientName: string;
}

export async function getPlanDetail(planId: string): Promise<PlanDetail | null> {
  const [row] = await db
    .select({
      id: maintenancePlans.id,
      name: maintenancePlans.name,
      status: maintenancePlans.status,
      startDate: maintenancePlans.startDate,
      endDate: maintenancePlans.endDate,
      billingTotalCents: maintenancePlans.billingTotalCents,
      billingCadence: maintenancePlans.billingCadence,
      notes: maintenancePlans.notes,
      homeAssessmentUrl: maintenancePlans.homeAssessmentUrl,
      playbookUrl: maintenancePlans.playbookUrl,
      propertyId: properties.id,
      propertyName: properties.name,
      propertyAddress: properties.address,
      clientId: clients.id,
      clientName: clients.name,
    })
    .from(maintenancePlans)
    .innerJoin(properties, eq(properties.id, maintenancePlans.propertyId))
    .innerJoin(clients, eq(clients.id, properties.clientId))
    .where(eq(maintenancePlans.id, planId))
    .limit(1);

  return row ?? null;
}

export interface VisitWithScope {
  id: string;
  planId: string;
  title: string;
  scheduledDate: string;
  status: string;
  visitOrder: number;
  isAdHoc: boolean;
  vendorId: string | null;
  vendorName: string | null;
  assignedFieldStaffId: string | null;
  appointmentId: string | null;
  notes: string | null;
  completedAt: Date | null;
  scopeItems: ScopeItemRow[];
}

export interface ScopeItemRow {
  id: string;
  visitId: string;
  scopeType: string;
  customLabel: string | null;
  vendorId: string | null;
  vendorName: string | null;
  completed: boolean;
  completionNotes: string | null;
  itemOrder: number;
}

/**
 * Visits + scope items for a plan, ordered by visit_order then
 * scheduled_date. Two queries (visits, scope items) merged in JS so
 * the response shape matches the visit-tab UI directly.
 */
export async function getPlanVisits(planId: string): Promise<VisitWithScope[]> {
  const visitRows = await db
    .select({
      id: maintenanceVisits.id,
      planId: maintenanceVisits.planId,
      title: maintenanceVisits.title,
      scheduledDate: maintenanceVisits.scheduledDate,
      status: maintenanceVisits.status,
      visitOrder: maintenanceVisits.visitOrder,
      isAdHoc: maintenanceVisits.isAdHoc,
      vendorId: maintenanceVisits.vendorId,
      vendorName: vendors.name,
      assignedFieldStaffId: maintenanceVisits.assignedFieldStaffId,
      appointmentId: maintenanceVisits.appointmentId,
      notes: maintenanceVisits.notes,
      completedAt: maintenanceVisits.completedAt,
    })
    .from(maintenanceVisits)
    .leftJoin(vendors, eq(vendors.id, maintenanceVisits.vendorId))
    .where(eq(maintenanceVisits.planId, planId))
    .orderBy(asc(maintenanceVisits.visitOrder), asc(maintenanceVisits.scheduledDate));

  if (visitRows.length === 0) return [];

  const visitIds = visitRows.map((v) => v.id);
  const scopeRows = await db
    .select({
      id: maintenanceVisitScopeItems.id,
      visitId: maintenanceVisitScopeItems.visitId,
      scopeType: maintenanceVisitScopeItems.scopeType,
      customLabel: maintenanceVisitScopeItems.customLabel,
      vendorId: maintenanceVisitScopeItems.vendorId,
      vendorName: vendors.name,
      completed: maintenanceVisitScopeItems.completed,
      completionNotes: maintenanceVisitScopeItems.completionNotes,
      itemOrder: maintenanceVisitScopeItems.itemOrder,
    })
    .from(maintenanceVisitScopeItems)
    .leftJoin(vendors, eq(vendors.id, maintenanceVisitScopeItems.vendorId))
    .where(inArray(maintenanceVisitScopeItems.visitId, visitIds))
    .orderBy(asc(maintenanceVisitScopeItems.itemOrder));

  const scopeByVisit = new Map<string, ScopeItemRow[]>();
  for (const s of scopeRows) {
    const list = scopeByVisit.get(s.visitId) ?? [];
    list.push(s);
    scopeByVisit.set(s.visitId, list);
  }

  return visitRows.map((v) => ({
    ...v,
    scopeItems: scopeByVisit.get(v.id) ?? [],
  }));
}

/** Plans for a single client, across every property. Used by the
 *  client-detail "Maintenance" tab in admin and (Session B-2) the
 *  read-only client-portal view. */
export async function listPlansForClient(clientId: string): Promise<PlanListRow[]> {
  const propertyRows = await db
    .select({ id: properties.id })
    .from(properties)
    .where(eq(properties.clientId, clientId));

  if (propertyRows.length === 0) return [];

  const propertyIds = propertyRows.map((p) => p.id);

  const rows = await db
    .select({
      id: maintenancePlans.id,
      name: maintenancePlans.name,
      status: maintenancePlans.status,
      startDate: maintenancePlans.startDate,
      endDate: maintenancePlans.endDate,
      billingTotalCents: maintenancePlans.billingTotalCents,
      billingCadence: maintenancePlans.billingCadence,
      propertyId: properties.id,
      propertyName: properties.name,
      clientId: clients.id,
      clientName: clients.name,
    })
    .from(maintenancePlans)
    .innerJoin(properties, eq(properties.id, maintenancePlans.propertyId))
    .innerJoin(clients, eq(clients.id, properties.clientId))
    .where(inArray(maintenancePlans.propertyId, propertyIds))
    .orderBy(desc(maintenancePlans.startDate));

  if (rows.length === 0) return [];

  const planIds = rows.map((r) => r.id);
  const visitRows = await db
    .select({
      planId: maintenanceVisits.planId,
      status: maintenanceVisits.status,
    })
    .from(maintenanceVisits)
    .where(inArray(maintenanceVisits.planId, planIds));

  const visitsByPlan = new Map<string, { total: number; completed: number }>();
  for (const v of visitRows) {
    const acc = visitsByPlan.get(v.planId) ?? { total: 0, completed: 0 };
    acc.total += 1;
    if (v.status === 'completed') acc.completed += 1;
    visitsByPlan.set(v.planId, acc);
  }

  return rows.map((r) => {
    const counts = visitsByPlan.get(r.id) ?? { total: 0, completed: 0 };
    return {
      ...r,
      visitCount: counts.total,
      completedVisitCount: counts.completed,
    };
  });
}

/** Helper used by the action layer when verifying that a plan
 *  belongs to the given property — defence in depth alongside RLS. */
export async function getPlanWithProperty(planId: string) {
  const [row] = await db
    .select({
      id: maintenancePlans.id,
      propertyId: maintenancePlans.propertyId,
      clientId: properties.clientId,
      name: maintenancePlans.name,
    })
    .from(maintenancePlans)
    .innerJoin(properties, eq(properties.id, maintenancePlans.propertyId))
    .where(eq(maintenancePlans.id, planId))
    .limit(1);
  return row ?? null;
}

/** Reverse lookup — given a visit, what plan + client owns it. Used
 *  by visit-mutation actions for ownership + audit metadata. */
export async function getVisitWithContext(visitId: string) {
  const [row] = await db
    .select({
      id: maintenanceVisits.id,
      title: maintenanceVisits.title,
      planId: maintenanceVisits.planId,
      planName: maintenancePlans.name,
      propertyId: maintenancePlans.propertyId,
      clientId: properties.clientId,
      appointmentId: maintenanceVisits.appointmentId,
      scheduledDate: maintenanceVisits.scheduledDate,
    })
    .from(maintenanceVisits)
    .innerJoin(maintenancePlans, eq(maintenancePlans.id, maintenanceVisits.planId))
    .innerJoin(properties, eq(properties.id, maintenancePlans.propertyId))
    .where(eq(maintenanceVisits.id, visitId))
    .limit(1);
  return row ?? null;
}

/** Lightweight existence + ownership check for the addVisit action. */
export async function getPlanScope(planId: string) {
  const [row] = await db
    .select({
      id: maintenancePlans.id,
      propertyId: maintenancePlans.propertyId,
      clientId: properties.clientId,
      name: maintenancePlans.name,
      status: maintenancePlans.status,
    })
    .from(maintenancePlans)
    .innerJoin(properties, eq(properties.id, maintenancePlans.propertyId))
    .where(eq(maintenancePlans.id, planId))
    .limit(1);
  return row ?? null;
}

