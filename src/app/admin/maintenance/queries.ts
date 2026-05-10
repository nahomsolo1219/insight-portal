// Reads for the admin /admin/maintenance surface. Composes the shared
// `src/lib/maintenance/queries.ts` reads with picker data the admin
// builder needs (property list filtered to active clients, active
// vendors, field-staff candidates).

import 'server-only';

import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import {
  clients,
  maintenancePlans,
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

