// Read queries scoped to a single client. RLS enforces this at the DB
// level, but every query here also filters explicitly by `clientId` so the
// intent is obvious in code review and a misconfigured RLS policy can't
// leak someone else's data.

import { and, asc, count, desc, eq, gte, inArray, sum } from 'drizzle-orm';
import { db } from '@/db';
import {
  appointments,
  clients,
  documents,
  invoices,
  milestones,
  photos,
  projects,
  properties,
  reports,
  staff,
} from '@/db/schema';
import { getSignedUrls } from '@/lib/storage/upload';

export interface ClientProfile {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  memberSince: string | null;
  assignedPmName: string | null;
  assignedPmEmail: string | null;
  assignedPmPhone: string | null;
}

/**
 * The signed-in client's own client record + their assigned project
 * manager's contact details (small "Your team" card on the dashboard).
 */
export async function getMyClientProfile(clientId: string): Promise<ClientProfile | null> {
  const [client] = await db
    .select({
      id: clients.id,
      name: clients.name,
      email: clients.email,
      phone: clients.phone,
      memberSince: clients.memberSince,
      assignedPmName: staff.name,
      assignedPmEmail: staff.email,
      assignedPmPhone: staff.phone,
    })
    .from(clients)
    .leftJoin(staff, eq(staff.id, clients.assignedPmId))
    .where(eq(clients.id, clientId))
    .limit(1);

  return client ?? null;
}

export interface ClientDashboardStats {
  activeProjects: number;
  pendingDecisions: number;
  upcomingAppointments: number;
  outstandingCents: number;
  propertyCount: number;
}

/**
 * Headline counts for the portal dashboard cards. We do property/project
 * lookups first (so we can scope by ID lists) and run the dependent counts
 * in parallel after each step. Outstanding-balance can run in parallel
 * with the property fetch — it only needs `clientId`.
 */
export async function getClientDashboardStats(
  clientId: string,
): Promise<ClientDashboardStats> {
  const [propertyRows, balanceRow] = await Promise.all([
    db
      .select({ id: properties.id })
      .from(properties)
      .where(eq(properties.clientId, clientId)),
    db
      .select({ total: sum(invoices.amountCents).mapWith(Number) })
      .from(invoices)
      .where(
        and(
          eq(invoices.clientId, clientId),
          inArray(invoices.status, ['unpaid', 'partial']),
        ),
      )
      .then((rows) => rows[0]),
  ]);

  const propertyIds = propertyRows.map((p) => p.id);
  const outstandingCents = balanceRow?.total ?? 0;

  if (propertyIds.length === 0) {
    return {
      activeProjects: 0,
      pendingDecisions: 0,
      upcomingAppointments: 0,
      outstandingCents,
      propertyCount: 0,
    };
  }

  const today = new Date().toISOString().slice(0, 10);

  // Three parallel reads keyed off the property-id list.
  const [activeProjectRow, projectIdRows, upcomingRow] = await Promise.all([
    db
      .select({ count: count() })
      .from(projects)
      .where(
        and(eq(projects.status, 'active'), inArray(projects.propertyId, propertyIds)),
      )
      .then((rows) => rows[0]),
    db
      .select({ id: projects.id })
      .from(projects)
      .where(inArray(projects.propertyId, propertyIds)),
    db
      .select({ count: count() })
      .from(appointments)
      .where(
        and(
          inArray(appointments.propertyId, propertyIds),
          gte(appointments.date, today),
          inArray(appointments.status, ['scheduled', 'confirmed']),
        ),
      )
      .then((rows) => rows[0]),
  ]);

  const activeProjects = Number(activeProjectRow?.count ?? 0);
  const upcomingAppointments = Number(upcomingRow?.count ?? 0);
  const projectIds = projectIdRows.map((p) => p.id);

  let pendingDecisions = 0;
  if (projectIds.length > 0) {
    const [decisionRow] = await db
      .select({ count: count() })
      .from(milestones)
      .where(
        and(
          eq(milestones.status, 'awaiting_client'),
          inArray(milestones.projectId, projectIds),
        ),
      );
    pendingDecisions = Number(decisionRow?.count ?? 0);
  }

  return {
    activeProjects,
    pendingDecisions,
    upcomingAppointments,
    outstandingCents,
    propertyCount: propertyIds.length,
  };
}

export interface UpcomingAppointmentRow {
  id: string;
  title: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled';
  propertyName: string;
  projectName: string | null;
}

/** Next-N upcoming appointments for the dashboard "Upcoming visits" list. */
export async function getClientUpcomingAppointments(
  clientId: string,
  limit = 3,
): Promise<UpcomingAppointmentRow[]> {
  const today = new Date().toISOString().slice(0, 10);

  return db
    .select({
      id: appointments.id,
      title: appointments.title,
      date: appointments.date,
      startTime: appointments.startTime,
      endTime: appointments.endTime,
      status: appointments.status,
      propertyName: properties.name,
      projectName: projects.name,
    })
    .from(appointments)
    .innerJoin(properties, eq(properties.id, appointments.propertyId))
    .leftJoin(projects, eq(projects.id, appointments.projectId))
    .where(
      and(
        eq(properties.clientId, clientId),
        gte(appointments.date, today),
        inArray(appointments.status, ['scheduled', 'confirmed']),
      ),
    )
    .orderBy(asc(appointments.date), asc(appointments.startTime))
    .limit(limit);
}

export interface ClientProjectRow {
  id: string;
  name: string;
  type: 'maintenance' | 'remodel';
  status: 'active' | 'completed' | 'on_hold';
  progress: number;
  startDate: string | null;
  endDate: string | null;
  propertyName: string;
}

/** All currently-active projects across all the client's properties. */
export async function getClientActiveProjects(
  clientId: string,
): Promise<ClientProjectRow[]> {
  return db
    .select({
      id: projects.id,
      name: projects.name,
      type: projects.type,
      status: projects.status,
      progress: projects.progress,
      startDate: projects.startDate,
      endDate: projects.endDate,
      propertyName: properties.name,
    })
    .from(projects)
    .innerJoin(properties, eq(properties.id, projects.propertyId))
    .where(and(eq(properties.clientId, clientId), eq(projects.status, 'active')))
    .orderBy(desc(projects.startDate));
}

// ---------------------------------------------------------------------------
// Recent activity (dashboard feed) + portal nav badge counts
// ---------------------------------------------------------------------------

export type ActivityType = 'milestone' | 'photo' | 'report' | 'invoice';

export interface ActivityItem {
  type: ActivityType;
  title: string;
  subtitle: string;
  /** ISO timestamp; the UI sorts on this and renders relative time. */
  date: string;
  /** Project this item belongs to (when applicable). Drives the row's
   *  click destination — null falls back to /portal/projects. */
  projectId: string | null;
}

/**
 * Unified activity feed combining recent completed milestones, categorized
 * photo uploads, reports, and invoices. Each source contributes its top-N
 * candidates; we merge, sort by date desc, and slice.
 *
 * Note on milestone timestamps: the `milestones` table doesn't have a
 * dedicated `completedAt` column — `updatedAt` is the closest signal we
 * have for "when this flipped to complete". Acceptable while the only
 * thing that changes a complete milestone's row is, in practice, the
 * status flip itself.
 */
export async function getClientRecentActivity(
  clientId: string,
  limit = 8,
): Promise<ActivityItem[]> {
  const clientProperties = await db
    .select({ id: properties.id })
    .from(properties)
    .where(eq(properties.clientId, clientId));

  const propertyIds = clientProperties.map((p) => p.id);

  const items: ActivityItem[] = [];

  if (propertyIds.length > 0) {
    const projectRows = await db
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .where(inArray(projects.propertyId, propertyIds));
    const projectIds = projectRows.map((p) => p.id);

    const [milestoneRows, photoRows, reportRows] = await Promise.all([
      projectIds.length === 0
        ? []
        : db
            .select({
              title: milestones.title,
              updatedAt: milestones.updatedAt,
              projectId: projects.id,
              projectName: projects.name,
            })
            .from(milestones)
            .innerJoin(projects, eq(projects.id, milestones.projectId))
            .where(
              and(
                inArray(milestones.projectId, projectIds),
                eq(milestones.status, 'complete'),
              ),
            )
            .orderBy(desc(milestones.updatedAt))
            .limit(limit),
      db
        .select({
          uploadedAt: photos.uploadedAt,
          projectId: photos.projectId,
          propertyName: properties.name,
        })
        .from(photos)
        .innerJoin(properties, eq(properties.id, photos.propertyId))
        .where(
          and(
            inArray(photos.propertyId, propertyIds),
            eq(photos.status, 'categorized'),
          ),
        )
        .orderBy(desc(photos.uploadedAt))
        .limit(20),
      db
        .select({
          name: reports.name,
          createdAt: reports.createdAt,
          propertyName: properties.name,
        })
        .from(reports)
        .innerJoin(properties, eq(properties.id, reports.propertyId))
        .where(inArray(reports.propertyId, propertyIds))
        .orderBy(desc(reports.createdAt))
        .limit(limit),
    ]);

    for (const m of milestoneRows) {
      items.push({
        type: 'milestone',
        title: `${m.title} completed`,
        subtitle: m.projectName,
        date: m.updatedAt.toISOString(),
        projectId: m.projectId,
      });
    }

    // Photos collapse into "N new photos at <Property> on <day>" so the
    // feed doesn't drown when field staff drops 12 shots at once.
    // Bucket key includes projectId so a row that links to one project
    // never silently collapses with a row from another project — the
    // user clicks expecting to land on the right project page.
    const photoBuckets = new Map<
      string,
      { count: number; latest: Date; propertyName: string; projectId: string | null }
    >();
    for (const p of photoRows) {
      const day = p.uploadedAt.toISOString().slice(0, 10);
      const key = `${day}__${p.propertyName}__${p.projectId ?? 'none'}`;
      const entry = photoBuckets.get(key);
      if (entry) {
        entry.count += 1;
        if (p.uploadedAt > entry.latest) entry.latest = p.uploadedAt;
      } else {
        photoBuckets.set(key, {
          count: 1,
          latest: p.uploadedAt,
          propertyName: p.propertyName,
          projectId: p.projectId,
        });
      }
    }
    for (const entry of photoBuckets.values()) {
      items.push({
        type: 'photo',
        title:
          entry.count === 1
            ? '1 new photo added'
            : `${entry.count} new photos added`,
        subtitle: entry.propertyName,
        date: entry.latest.toISOString(),
        projectId: entry.projectId,
      });
    }

    for (const r of reportRows) {
      items.push({
        type: 'report',
        title: `${r.name} added`,
        subtitle: r.propertyName,
        date: r.createdAt.toISOString(),
        projectId: null,
      });
    }
  }

  const recentInvoices = await db
    .select({
      number: invoices.invoiceNumber,
      description: invoices.description,
      invoiceDate: invoices.invoiceDate,
      createdAt: invoices.createdAt,
      amountCents: invoices.amountCents,
    })
    .from(invoices)
    .where(eq(invoices.clientId, clientId))
    .orderBy(desc(invoices.createdAt))
    .limit(limit);

  for (const inv of recentInvoices) {
    const dollars = (inv.amountCents ?? 0) / 100;
    items.push({
      type: 'invoice',
      title: `Invoice #${inv.number} issued`,
      subtitle: `$${dollars.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${inv.description ? ` · ${inv.description}` : ''}`,
      date: inv.createdAt.toISOString(),
      projectId: null,
    });
  }

  items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return items.slice(0, limit);
}

export interface RecentPhotoRow {
  id: string;
  caption: string | null;
  tag: 'before' | 'during' | 'after' | null;
  storagePath: string;
  signedUrl: string | null;
  projectId: string | null;
  propertyName: string;
}

/**
 * Most-recent categorized photos across all the client's properties for
 * the dashboard "Recent photos" widget. Same scope-by-clientId pattern;
 * URLs signed in one batch.
 */
export async function getClientRecentPhotos(
  clientId: string,
  limit = 6,
): Promise<RecentPhotoRow[]> {
  const clientProperties = await db
    .select({ id: properties.id })
    .from(properties)
    .where(eq(properties.clientId, clientId));

  const propertyIds = clientProperties.map((p) => p.id);
  if (propertyIds.length === 0) return [];

  const rows = await db
    .select({
      id: photos.id,
      caption: photos.caption,
      tag: photos.tag,
      storagePath: photos.storagePath,
      projectId: photos.projectId,
      propertyName: properties.name,
    })
    .from(photos)
    .innerJoin(properties, eq(properties.id, photos.propertyId))
    .where(
      and(
        inArray(photos.propertyId, propertyIds),
        eq(photos.status, 'categorized'),
      ),
    )
    .orderBy(desc(photos.uploadedAt))
    .limit(limit);

  if (rows.length === 0) return [];

  const urlByPath = await getSignedUrls(rows.map((p) => p.storagePath));
  return rows.map((p) => ({
    ...p,
    signedUrl: urlByPath.get(p.storagePath) ?? null,
  }));
}

export interface PortalBadgeCounts {
  pendingDecisions: number;
  unpaidInvoices: number;
  newDocuments: number;
}

/**
 * Counts driving the red-dot badges on the portal nav. Three signals:
 *  - decisions awaiting client response (Projects tab)
 *  - documents/reports added in the last 7 days (Documents tab)
 *  - unpaid + partial invoices (Invoices tab)
 *
 * Cheap because it's all `count()` aggregates — runs once per portal
 * request via the layout, threaded into PortalNav as a prop.
 */
export async function getPortalBadgeCounts(
  clientId: string,
): Promise<PortalBadgeCounts> {
  const clientProperties = await db
    .select({ id: properties.id })
    .from(properties)
    .where(eq(properties.clientId, clientId));

  const propertyIds = clientProperties.map((p) => p.id);

  // Run unpaid invoices in parallel with everything else — it doesn't need
  // the property/project lookup, so it can race ahead.
  const unpaidPromise = db
    .select({ count: count() })
    .from(invoices)
    .where(
      and(
        eq(invoices.clientId, clientId),
        inArray(invoices.status, ['unpaid', 'partial']),
      ),
    )
    .then((rows) => Number(rows[0]?.count ?? 0));

  if (propertyIds.length === 0) {
    const unpaidInvoices = await unpaidPromise;
    return { pendingDecisions: 0, unpaidInvoices, newDocuments: 0 };
  }

  const projectRows = await db
    .select({ id: projects.id })
    .from(projects)
    .where(inArray(projects.propertyId, propertyIds));
  const projectIds = projectRows.map((p) => p.id);

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [decisionRow, docRow, reportRow, unpaidInvoices] = await Promise.all([
    projectIds.length === 0
      ? Promise.resolve(0)
      : db
          .select({ count: count() })
          .from(milestones)
          .where(
            and(
              inArray(milestones.projectId, projectIds),
              eq(milestones.status, 'awaiting_client'),
            ),
          )
          .then((rows) => Number(rows[0]?.count ?? 0)),
    projectIds.length === 0
      ? Promise.resolve(0)
      : db
          .select({ count: count() })
          .from(documents)
          .where(
            and(
              inArray(documents.projectId, projectIds),
              gte(documents.createdAt, sevenDaysAgo),
            ),
          )
          .then((rows) => Number(rows[0]?.count ?? 0)),
    db
      .select({ count: count() })
      .from(reports)
      .where(
        and(
          inArray(reports.propertyId, propertyIds),
          gte(reports.createdAt, sevenDaysAgo),
        ),
      )
      .then((rows) => Number(rows[0]?.count ?? 0)),
    unpaidPromise,
  ]);

  return {
    pendingDecisions: decisionRow,
    unpaidInvoices,
    newDocuments: docRow + reportRow,
  };
}
