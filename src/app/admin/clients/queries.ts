// Queries for the clients list page. The list view is a cross-client
// dashboard, so we denormalise counts and one-row-per-client summaries via
// per-aggregate queries rather than trying to do it in a single SQL statement.
// This stays fast for ~50 clients; revisit if we grow past that.

import { and, count, eq, inArray, sql, sum } from 'drizzle-orm';
import { db } from '@/db';
import { clients, invoices, membershipTiers, profiles, projects, properties, staff } from '@/db/schema';
import { getSignedUrlsAdmin } from '@/lib/storage/upload';

export interface ClientRow {
  id: string;
  name: string;
  status: string;
  email: string | null;
  phone: string | null;
  memberSince: string | null;
  propertyCount: number;
  activeProjectCount: number;
  balanceCents: number;
  tierName: string | null;
  assignedPmName: string | null;
  /** First property's address, for the list-row subtitle. */
  primaryAddress: string | null;
  /** Signed URL for the client's avatar, or null when no avatar uploaded. */
  avatarUrl: string | null;
  /**
   * Whether this client has been invited to the portal yet — true once a
   * `profiles` row with role=client is linked to them. Mirrors the
   * invited/not_invited chip logic in the client detail page
   * (`getClientPortalStatus`), batched across the whole list here.
   */
  invited: boolean;
}

export async function listClients(): Promise<ClientRow[]> {
  // Base rows, joined with tier + PM. This query must run first because it
  // produces the clientId list every aggregate below is scoped to. The
  // LIMIT is a safety bound, not a feature: this is a luxury book of ~50
  // clients, so 500 is ~10x headroom and never trims real data — it just
  // stops a runaway table read from ever fanning the whole page out.
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
      avatarStoragePath: clients.avatarStoragePath,
    })
    .from(clients)
    .leftJoin(membershipTiers, eq(membershipTiers.id, clients.membershipTierId))
    .leftJoin(staff, eq(staff.id, clients.assignedPmId))
    .orderBy(clients.name)
    .limit(500);

  if (rows.length === 0) return [];

  const clientIds = rows.map((r) => r.id);
  const avatarPaths = rows
    .map((r) => r.avatarStoragePath)
    .filter((p): p is string => Boolean(p));

  // The four aggregates and the avatar-signing call are independent once we
  // hold `clientIds` / `avatarPaths`, so fan them out in one wave instead of
  // five serial round-trips (this used to await each in sequence).
  const [propertyAggregates, projectAggregates, balanceAggregates, invitedRows, avatarUrls] =
    await Promise.all([
      // Property count + an arbitrary-but-stable "first" address per client.
      db
        .select({
          clientId: properties.clientId,
          count: count(),
          firstAddress: sql<string>`min(${properties.address})`,
        })
        .from(properties)
        .where(inArray(properties.clientId, clientIds))
        .groupBy(properties.clientId),
      // Active project counts. Projects live on properties, so we join through.
      db
        .select({
          clientId: properties.clientId,
          activeCount: count(),
        })
        .from(projects)
        .innerJoin(properties, eq(properties.id, projects.propertyId))
        .where(and(eq(projects.status, 'active'), inArray(properties.clientId, clientIds)))
        .groupBy(properties.clientId),
      // Outstanding balance: unpaid + partial invoice totals per client.
      db
        .select({
          clientId: invoices.clientId,
          balanceCents: sum(invoices.amountCents).mapWith(Number),
        })
        .from(invoices)
        .where(
          and(
            inArray(invoices.clientId, clientIds),
            inArray(invoices.status, ['unpaid', 'partial']),
          ),
        )
        .groupBy(invoices.clientId),
      // Portal-invite status: a client is "invited" once a role=client
      // profile is linked to it. Same detection as `getClientPortalStatus`
      // on the detail page, batched across the whole list.
      db
        .select({ clientId: profiles.clientId })
        .from(profiles)
        .where(and(eq(profiles.role, 'client'), inArray(profiles.clientId, clientIds))),
      // Sign every avatar in one batch — saves a round-trip per row.
      avatarPaths.length > 0
        ? getSignedUrlsAdmin(avatarPaths)
        : Promise.resolve(new Map<string, string>()),
    ]);

  const propertyMap = new Map(
    propertyAggregates.map((p) => [
      p.clientId,
      { count: Number(p.count), firstAddress: p.firstAddress },
    ]),
  );

  const projectMap = new Map(projectAggregates.map((p) => [p.clientId, Number(p.activeCount)]));

  const balanceMap = new Map(balanceAggregates.map((b) => [b.clientId, b.balanceCents ?? 0]));

  const invitedSet = new Set(
    invitedRows.map((r) => r.clientId).filter((id): id is string => Boolean(id)),
  );

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    status: r.status,
    email: r.email,
    phone: r.phone,
    memberSince: r.memberSince,
    tierName: r.tierName,
    assignedPmName: r.assignedPmName,
    propertyCount: propertyMap.get(r.id)?.count ?? 0,
    primaryAddress: propertyMap.get(r.id)?.firstAddress ?? null,
    activeProjectCount: projectMap.get(r.id) ?? 0,
    balanceCents: balanceMap.get(r.id) ?? 0,
    avatarUrl: r.avatarStoragePath ? avatarUrls.get(r.avatarStoragePath) ?? null : null,
    invited: invitedSet.has(r.id),
  }));
}

export interface TierOption {
  id: string;
  name: string;
}

export interface PmOption {
  id: string;
  name: string;
  role: 'founder' | 'project_manager' | 'field_staff' | 'admin_assistant';
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
