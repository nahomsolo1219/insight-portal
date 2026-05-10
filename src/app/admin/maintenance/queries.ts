// Reads for the admin /admin/maintenance surface. Composes the shared
// `src/lib/maintenance/queries.ts` reads with picker data the admin
// builder needs (property list filtered to active clients, active
// vendors, field-staff candidates).

import 'server-only';

import { and, asc, desc, eq, inArray, or } from 'drizzle-orm';
import { db } from '@/db';
import {
  auditLog,
  clients,
  maintenancePlans,
  maintenanceVisits,
  maintenanceVisitScopeItems,
  profiles,
  properties,
  staff,
  vendors,
} from '@/db/schema';

export {
  getPlanDetail,
  getPlanScope,
  getPlanVisits,
  getPlanWithProperty,
  getVisitWithContext,
  listPlans,
  listPlansForClient,
  PLAN_STATUSES,
  VISIT_STATUSES,
  BILLING_CADENCES,
} from '@/lib/maintenance/queries';
export type {
  PlanDetail,
  PlanListRow,
  PlanStatus,
  ScopeItemRow,
  VisitStatus,
  VisitWithScope,
  BillingCadence,
} from '@/lib/maintenance/queries';

export interface PropertyPickerRow {
  id: string;
  name: string;
  address: string;
  clientId: string;
  clientName: string;
}

/** Active-client properties — drives the property picker on Step 1
 *  of the plan builder. Sorted by client name then property name so
 *  the picker reads alphabetically without extra UI work. */
export async function getActivePropertiesForPicker(): Promise<PropertyPickerRow[]> {
  return db
    .select({
      id: properties.id,
      name: properties.name,
      address: properties.address,
      clientId: clients.id,
      clientName: clients.name,
    })
    .from(properties)
    .innerJoin(clients, eq(clients.id, properties.clientId))
    .where(eq(clients.status, 'active'))
    .orderBy(asc(clients.name), asc(properties.name));
}

export interface VendorPickerRow {
  id: string;
  name: string;
  category: string;
}

export async function getActiveVendorsForPicker(): Promise<VendorPickerRow[]> {
  return db
    .select({
      id: vendors.id,
      name: vendors.name,
      category: vendors.category,
    })
    .from(vendors)
    .where(eq(vendors.active, true))
    .orderBy(asc(vendors.name));
}

export interface FieldStaffPickerRow {
  profileId: string;
  name: string;
}

/** Active field staff with a linked auth profile — eligible to be
 *  assigned to a maintenance visit. Same shape used by the project
 *  Team tab; a per-staff project-load count would be nice but isn't
 *  in scope for the maintenance builder yet. */
export async function getActiveFieldStaff(): Promise<FieldStaffPickerRow[]> {
  return db
    .select({
      profileId: profiles.id,
      name: staff.name,
    })
    .from(staff)
    .innerJoin(profiles, eq(profiles.staffId, staff.id))
    .where(and(eq(staff.role, 'field_staff'), eq(staff.status, 'active')))
    .orderBy(asc(staff.name));
}

export interface PlanAuditEntry {
  id: string;
  action: string;
  targetType: string;
  targetLabel: string;
  actorName: string | null;
  createdAt: Date;
  metadata: unknown;
}

/**
 * Audit-log entries for a plan and its descendants — drives the
 * History tab on the plan detail page. Pulls the plan row directly,
 * any visit row whose plan_id matches, and any scope item whose
 * visit_id belongs to the plan. Returns newest first; capped at
 * 200 entries since the History tab is meant to summarise, not
 * paginate.
 */
export async function getPlanHistory(planId: string): Promise<PlanAuditEntry[]> {
  const visitIdRows = await db
    .select({ id: maintenanceVisits.id })
    .from(maintenanceVisits)
    .where(eq(maintenanceVisits.planId, planId));
  const visitIds = visitIdRows.map((r) => r.id);

  const scopeIdRows =
    visitIds.length > 0
      ? await db
          .select({ id: maintenanceVisitScopeItems.id })
          .from(maintenanceVisitScopeItems)
          .where(inArray(maintenanceVisitScopeItems.visitId, visitIds))
      : [];
  const scopeIds = scopeIdRows.map((r) => r.id);

  const idClauses = [eq(auditLog.targetId, planId)];
  if (visitIds.length > 0) idClauses.push(inArray(auditLog.targetId, visitIds));
  if (scopeIds.length > 0) idClauses.push(inArray(auditLog.targetId, scopeIds));

  const rows = await db
    .select({
      id: auditLog.id,
      action: auditLog.action,
      targetType: auditLog.targetType,
      targetLabel: auditLog.targetLabel,
      actorName: auditLog.actorName,
      createdAt: auditLog.createdAt,
      metadata: auditLog.metadata,
    })
    .from(auditLog)
    .where(
      and(
        inArray(auditLog.targetType, [
          'maintenance_plan',
          'maintenance_visit',
          'maintenance_scope_item',
        ]),
        // Drizzle's or() requires at least one predicate; fall through
        // to the bare planId clause when no visits exist yet.
        idClauses.length === 1 ? idClauses[0] : or(...idClauses)!,
      ),
    )
    .orderBy(desc(auditLog.createdAt))
    .limit(200);

  return rows.map((r) => ({
    ...r,
    targetType: r.targetType ?? '',
    targetLabel: r.targetLabel ?? '',
  }));
}

/** Distinct year list for the year filter on the plan list page —
 *  derived from `start_date` so admin sees only years that have
 *  plans. Returns descending (newest first). */
export async function getPlanYearOptions(): Promise<number[]> {
  const rows = await db
    .select({ startDate: maintenancePlans.startDate })
    .from(maintenancePlans);

  const years = new Set<number>();
  for (const r of rows) {
    if (!r.startDate) continue;
    const yr = Number(r.startDate.slice(0, 4));
    if (!Number.isNaN(yr)) years.add(yr);
  }
  return [...years].sort((a, b) => b - a);
}

