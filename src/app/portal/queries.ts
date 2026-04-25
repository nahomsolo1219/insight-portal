// Read queries scoped to a single client. RLS enforces this at the DB
// level, but every query here also filters explicitly by `clientId` so the
// intent is obvious in code review and a misconfigured RLS policy can't
// leak someone else's data.

import { and, asc, count, desc, eq, gte, inArray, sum } from 'drizzle-orm';
import { db } from '@/db';
import {
  appointments,
  clients,
  invoices,
  milestones,
  projects,
  properties,
  staff,
} from '@/db/schema';

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
