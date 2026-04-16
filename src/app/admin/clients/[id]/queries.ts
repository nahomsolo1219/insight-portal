// Client detail queries. `getClientDetail` drives the page header + stats +
// property switcher; `getProjectsForProperty` drives the Projects tab.
// Pure reads — the page component enforces auth before calling these.

import { and, asc, count, desc, eq, inArray, sum } from 'drizzle-orm';
import { db } from '@/db';
import {
  clients,
  documents,
  invoices,
  membershipTiers,
  milestones,
  projects,
  properties,
  staff,
  vendors,
} from '@/db/schema';

export interface ClientDetailRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: string;
  memberSince: string | null;
  tierName: string | null;
  tierId: string | null;
  assignedPmName: string | null;
  assignedPmId: string | null;
}

export interface PropertyRow {
  id: string;
  name: string;
  address: string;
  city: string | null;
  state: string | null;
  zipcode: string | null;
  sqft: number | null;
  yearBuilt: number | null;
  gateCode: string | null;
  accessNotes: string | null;
  emergencyContact: string | null;
}

export interface ClientDetailStats {
  activeProjectCount: number;
  balanceCents: number;
  propertyCount: number;
}

/**
 * Fetch a single property's full record for the Profile tab's edit modal.
 * Returns null if the property doesn't exist.
 */
export async function getPropertyDetail(propertyId: string): Promise<PropertyRow | null> {
  const [property] = await db
    .select({
      id: properties.id,
      name: properties.name,
      address: properties.address,
      city: properties.city,
      state: properties.state,
      zipcode: properties.zipcode,
      sqft: properties.sqft,
      yearBuilt: properties.yearBuilt,
      gateCode: properties.gateCode,
      accessNotes: properties.accessNotes,
      emergencyContact: properties.emergencyContact,
    })
    .from(properties)
    .where(eq(properties.id, propertyId))
    .limit(1);

  return property ?? null;
}

export interface ClientDetailPayload {
  client: ClientDetailRow;
  properties: PropertyRow[];
  stats: ClientDetailStats;
}

/**
 * Fetch everything needed to render the client detail header + stats +
 * property switcher. Returns null when the client doesn't exist so the page
 * can route to a 404 via `notFound()`.
 */
export async function getClientDetail(clientId: string): Promise<ClientDetailPayload | null> {
  const [client] = await db
    .select({
      id: clients.id,
      name: clients.name,
      email: clients.email,
      phone: clients.phone,
      status: clients.status,
      memberSince: clients.memberSince,
      tierName: membershipTiers.name,
      tierId: membershipTiers.id,
      assignedPmName: staff.name,
      assignedPmId: staff.id,
    })
    .from(clients)
    .leftJoin(membershipTiers, eq(membershipTiers.id, clients.membershipTierId))
    .leftJoin(staff, eq(staff.id, clients.assignedPmId))
    .where(eq(clients.id, clientId))
    .limit(1);

  if (!client) return null;

  const clientProperties = await db
    .select({
      id: properties.id,
      name: properties.name,
      address: properties.address,
      city: properties.city,
      state: properties.state,
      zipcode: properties.zipcode,
      sqft: properties.sqft,
      yearBuilt: properties.yearBuilt,
      gateCode: properties.gateCode,
      accessNotes: properties.accessNotes,
      emergencyContact: properties.emergencyContact,
    })
    .from(properties)
    .where(eq(properties.clientId, clientId))
    .orderBy(asc(properties.name));

  const propertyIds = clientProperties.map((p) => p.id);

  // Active project count across all of this client's properties.
  let activeProjectCount = 0;
  if (propertyIds.length > 0) {
    const [row] = await db
      .select({ count: count() })
      .from(projects)
      .where(and(eq(projects.status, 'active'), inArray(projects.propertyId, propertyIds)));
    activeProjectCount = Number(row?.count ?? 0);
  }

  // Outstanding balance: sum of unpaid + partial invoice cents.
  const [balanceRow] = await db
    .select({ total: sum(invoices.amountCents).mapWith(Number) })
    .from(invoices)
    .where(and(eq(invoices.clientId, clientId), inArray(invoices.status, ['unpaid', 'partial'])));

  return {
    client,
    properties: clientProperties,
    stats: {
      activeProjectCount,
      balanceCents: balanceRow?.total ?? 0,
      propertyCount: clientProperties.length,
    },
  };
}

/**
 * Fetch projects for a specific property, each with its milestones.
 * One round-trip for projects, one for all of their milestones, then
 * grouped in memory. O(projects + milestones) — fast.
 */
export async function getProjectsForProperty(propertyId: string) {
  const projectRows = await db
    .select({
      id: projects.id,
      name: projects.name,
      type: projects.type,
      status: projects.status,
      startDate: projects.startDate,
      endDate: projects.endDate,
      progress: projects.progress,
      description: projects.description,
      contractCents: projects.contractCents,
      changesCents: projects.changesCents,
      paidCents: projects.paidCents,
    })
    .from(projects)
    .where(eq(projects.propertyId, propertyId))
    .orderBy(desc(projects.startDate));

  if (projectRows.length === 0) return [];

  const projectIds = projectRows.map((p) => p.id);

  const allMilestones = await db
    .select({
      id: milestones.id,
      projectId: milestones.projectId,
      title: milestones.title,
      category: milestones.category,
      dueDate: milestones.dueDate,
      status: milestones.status,
      vendorName: vendors.name,
      order: milestones.order,
      questionType: milestones.questionType,
      questionBody: milestones.questionBody,
    })
    .from(milestones)
    .leftJoin(vendors, eq(vendors.id, milestones.vendorId))
    .where(inArray(milestones.projectId, projectIds))
    .orderBy(asc(milestones.order), asc(milestones.dueDate));

  type MilestoneRow = (typeof allMilestones)[number];
  const byProject = new Map<string, MilestoneRow[]>();
  for (const m of allMilestones) {
    const existing = byProject.get(m.projectId);
    if (existing) existing.push(m);
    else byProject.set(m.projectId, [m]);
  }

  return projectRows.map((p) => {
    const ms = byProject.get(p.id) ?? [];
    return {
      ...p,
      milestones: ms,
      milestoneStats: {
        total: ms.length,
        completed: ms.filter((m) => m.status === 'complete').length,
      },
    };
  });
}

export type ProjectWithMilestones = Awaited<ReturnType<typeof getProjectsForProperty>>[number];
export type MilestoneRow = ProjectWithMilestones['milestones'][number];

// ---------------------------------------------------------------------------
// Documents tab
// ---------------------------------------------------------------------------

export interface DocumentRow {
  id: string;
  name: string;
  /** YYYY-MM-DD string from the DB. */
  date: string;
  /** 'contract' | 'drawing' | 'permit' | 'spec_sheet' | 'warranty' | 'other' */
  type: string;
  storagePath: string;
  projectId: string;
  projectName: string;
  createdAt: Date;
}

/**
 * Every document attached to any project on this property. Sorted by
 * document date descending (then createdAt as a tiebreaker for same-day
 * uploads). Grouping by project happens on the client.
 */
export async function getDocumentsForProperty(propertyId: string): Promise<DocumentRow[]> {
  return db
    .select({
      id: documents.id,
      name: documents.name,
      date: documents.date,
      type: documents.type,
      storagePath: documents.storagePath,
      projectId: documents.projectId,
      projectName: projects.name,
      createdAt: documents.createdAt,
    })
    .from(documents)
    .innerJoin(projects, eq(projects.id, documents.projectId))
    .where(eq(projects.propertyId, propertyId))
    .orderBy(desc(documents.date), desc(documents.createdAt));
}

export interface ProjectOption {
  id: string;
  name: string;
  type: 'maintenance' | 'remodel';
}

/**
 * Light project list for the "which project?" picker in the upload modal.
 * Ordered newest-first so the most recently-started project is the
 * default selection.
 */
export async function getProjectsForPropertySelect(propertyId: string): Promise<ProjectOption[]> {
  return db
    .select({ id: projects.id, name: projects.name, type: projects.type })
    .from(projects)
    .where(eq(projects.propertyId, propertyId))
    .orderBy(desc(projects.startDate));
}
