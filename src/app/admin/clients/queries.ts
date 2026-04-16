// Queries for the clients list page. The list view is a cross-client
// dashboard, so we denormalise counts and one-row-per-client summaries via
// per-aggregate queries rather than trying to do it in a single SQL statement.
// This stays fast for ~50 clients; revisit if we grow past that.

import { and, count, eq, inArray, sql, sum } from 'drizzle-orm';
import { db } from '@/db';
import { clients, invoices, membershipTiers, projects, properties, staff } from '@/db/schema';

export interface ClientRow {
  id: string;
  name: string;
  status: string;
  email: string;
  phone: string | null;
  memberSince: string | null;
  propertyCount: number;
  activeProjectCount: number;
  balanceCents: number;
  tierName: string | null;
  assignedPmName: string | null;
  /** First property's address, for the list-row subtitle. */
  primaryAddress: string | null;
}

export async function listClients(): Promise<ClientRow[]> {
  // Base rows, joined with tier + PM
  const rows = await db
    .select({
      id: clients.id,
      name: clients.name,
      status: clients.status,
      email: clients.email,
      phone: clients.phone,
      memberSince: clients.memberSince,
      tierName: membershipTiers.name,
      assignedPmName: staff.name,
    })
    .from(clients)
    .leftJoin(membershipTiers, eq(membershipTiers.id, clients.membershipTierId))
    .leftJoin(staff, eq(staff.id, clients.assignedPmId))
    .orderBy(clients.name);

  if (rows.length === 0) return [];

  const clientIds = rows.map((r) => r.id);

  // Property count + an arbitrary-but-stable "first" address per client.
  const propertyAggregates = await db
    .select({
      clientId: properties.clientId,
      count: count(),
      firstAddress: sql<string>`min(${properties.address})`,
    })
    .from(properties)
    .where(inArray(properties.clientId, clientIds))
    .groupBy(properties.clientId);

  const propertyMap = new Map(
    propertyAggregates.map((p) => [
      p.clientId,
      { count: Number(p.count), firstAddress: p.firstAddress },
    ]),
  );

  // Active project counts. Projects live on properties, so we join through.
  const projectAggregates = await db
    .select({
      clientId: properties.clientId,
      activeCount: count(),
    })
    .from(projects)
    .innerJoin(properties, eq(properties.id, projects.propertyId))
    .where(and(eq(projects.status, 'active'), inArray(properties.clientId, clientIds)))
    .groupBy(properties.clientId);

  const projectMap = new Map(projectAggregates.map((p) => [p.clientId, Number(p.activeCount)]));

  // Outstanding balance: unpaid + partial invoice totals per client.
  const balanceAggregates = await db
    .select({
      clientId: invoices.clientId,
      balanceCents: sum(invoices.amountCents).mapWith(Number),
    })
    .from(invoices)
    .where(
      and(inArray(invoices.clientId, clientIds), inArray(invoices.status, ['unpaid', 'partial'])),
    )
    .groupBy(invoices.clientId);

  const balanceMap = new Map(balanceAggregates.map((b) => [b.clientId, b.balanceCents ?? 0]));

  return rows.map((r) => ({
    ...r,
    propertyCount: propertyMap.get(r.id)?.count ?? 0,
    primaryAddress: propertyMap.get(r.id)?.firstAddress ?? null,
    activeProjectCount: projectMap.get(r.id) ?? 0,
    balanceCents: balanceMap.get(r.id) ?? 0,
  }));
}

export interface TierOption {
  id: string;
  name: string;
}

export interface PmOption {
  id: string;
  name: string;
  role: 'founder' | 'project_manager' | 'field_lead' | 'field_tech' | 'admin_assistant';
}

export interface ClientFormOptions {
  tiers: TierOption[];
  pms: PmOption[];
}

/** Dropdown options for the New Client modal. */
export async function getClientFormOptions(): Promise<ClientFormOptions> {
  const [tiers, pms] = await Promise.all([
    db
      .select({ id: membershipTiers.id, name: membershipTiers.name })
      .from(membershipTiers)
      .orderBy(membershipTiers.name),
    db
      .select({ id: staff.id, name: staff.name, role: staff.role })
      .from(staff)
      .where(and(eq(staff.status, 'active'), inArray(staff.role, ['founder', 'project_manager'])))
      .orderBy(staff.name),
  ]);
  return { tiers, pms };
}
