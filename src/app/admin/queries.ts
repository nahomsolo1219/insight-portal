// Dashboard queries. Pure async functions — no auth check here, the page
// component is responsible for calling `requireAdmin()` before invoking them.
//
// Every admin page follows this same pattern. See CLAUDE.md → "Page query
// pattern" for details.

import { and, count, desc, eq, gte, inArray, sum } from 'drizzle-orm';
import { db } from '@/db';
import {
  appointments,
  auditLog,
  clients,
  invoices,
  milestones,
  photos,
  projects,
  properties,
  staff,
  vendors,
} from '@/db/schema';

// Cast a YYYY-MM-DD local date to Postgres `date` as a plain string. Using
// local time (not UTC) means "today" follows the admin's calendar day rather
// than drifting into tomorrow after 5 PM PDT.
function localDateString(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Count of clients with status = 'active'. */
export async function getActiveClientsCount(): Promise<number> {
  const [row] = await db
    .select({ count: count() })
    .from(clients)
    .where(eq(clients.status, 'active'));
  return row?.count ?? 0;
}

/** Clients added in the last 30 days — drives the "↑ N new" trend chip. */
export async function getNewClientsThisMonthCount(): Promise<number> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [row] = await db
    .select({ count: count() })
    .from(clients)
    .where(gte(clients.createdAt, thirtyDaysAgo));
  return row?.count ?? 0;
}

/** Count of projects with status = 'active'. */
export async function getActiveProjectsCount(): Promise<number> {
  const [row] = await db
    .select({ count: count() })
    .from(projects)
    .where(eq(projects.status, 'active'));
  return row?.count ?? 0;
}

/** Sum of paid invoices for the current calendar month (in cents). */
export async function getRevenueMtdCents(): Promise<number> {
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);

  const [row] = await db
    .select({ total: sum(invoices.amountCents).mapWith(Number) })
    .from(invoices)
    .where(and(eq(invoices.status, 'paid'), gte(invoices.invoiceDate, localDateString(start))));
  return row?.total ?? 0;
}

/** Sum + count of unpaid & partially-paid invoices. */
export async function getOutstandingInvoices(): Promise<{ totalCents: number; count: number }> {
  const [row] = await db
    .select({
      totalCents: sum(invoices.amountCents).mapWith(Number),
      count: count(),
    })
    .from(invoices)
    .where(inArray(invoices.status, ['unpaid', 'partial']));
  return { totalCents: row?.totalCents ?? 0, count: row?.count ?? 0 };
}

export interface TodayAppointmentRow {
  id: string;
  title: string;
  startTime: string | null;
  endTime: string | null;
  status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled';
  davidOnSite: boolean;
  clientName: string | null;
  vendorName: string | null;
  pmName: string | null;
}

/** Today's appointments with joined client / vendor / PM names. */
export async function getTodaysAppointments(): Promise<TodayAppointmentRow[]> {
  return db
    .select({
      id: appointments.id,
      title: appointments.title,
      startTime: appointments.startTime,
      endTime: appointments.endTime,
      status: appointments.status,
      davidOnSite: appointments.davidOnSite,
      clientName: clients.name,
      vendorName: vendors.name,
      pmName: staff.name,
    })
    .from(appointments)
    .leftJoin(properties, eq(properties.id, appointments.propertyId))
    .leftJoin(clients, eq(clients.id, properties.clientId))
    .leftJoin(vendors, eq(vendors.id, appointments.vendorId))
    .leftJoin(staff, eq(staff.id, appointments.assignedPmId))
    .where(eq(appointments.date, localDateString()))
    .orderBy(appointments.startTime);
}

export interface UrgentDecisionRow {
  id: string;
  title: string;
  dueDate: string | null;
  projectName: string | null;
  clientName: string | null;
  clientId: string | null;
}

/** Milestones awaiting client response, sorted by due date (nulls last). */
export async function getUrgentDecisions(limit = 3): Promise<UrgentDecisionRow[]> {
  return db
    .select({
      id: milestones.id,
      title: milestones.title,
      dueDate: milestones.dueDate,
      projectName: projects.name,
      clientName: clients.name,
      clientId: clients.id,
    })
    .from(milestones)
    .leftJoin(projects, eq(projects.id, milestones.projectId))
    .leftJoin(properties, eq(properties.id, projects.propertyId))
    .leftJoin(clients, eq(clients.id, properties.clientId))
    .where(eq(milestones.status, 'awaiting_client'))
    .orderBy(milestones.dueDate)
    .limit(limit);
}

/** Count of photos still awaiting categorization by the admin. */
export async function getPendingPhotosCount(): Promise<number> {
  const [row] = await db
    .select({ count: count() })
    .from(photos)
    .where(eq(photos.status, 'pending'));
  return row?.count ?? 0;
}

export interface UnpaidInvoiceRow {
  id: string;
  invoiceNumber: string;
  amountCents: number;
  dueDate: string;
  clientName: string | null;
}

/** Unpaid invoices surfaced in the "Needs Attention" panel. */
export async function getUnpaidInvoicesForAlerts(limit = 2): Promise<UnpaidInvoiceRow[]> {
  return db
    .select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      amountCents: invoices.amountCents,
      dueDate: invoices.dueDate,
      clientName: clients.name,
    })
    .from(invoices)
    .leftJoin(clients, eq(clients.id, invoices.clientId))
    .where(eq(invoices.status, 'unpaid'))
    .orderBy(invoices.dueDate)
    .limit(limit);
}

export interface ActivityRow {
  id: string;
  actorName: string | null;
  action: string;
  targetLabel: string | null;
  clientId: string | null;
  clientName: string | null;
  createdAt: Date;
}

/** Most recent audit log entries for the activity feed. */
export async function getRecentActivity(limit = 6): Promise<ActivityRow[]> {
  return db
    .select({
      id: auditLog.id,
      actorName: auditLog.actorName,
      action: auditLog.action,
      targetLabel: auditLog.targetLabel,
      clientId: auditLog.clientId,
      clientName: clients.name,
      createdAt: auditLog.createdAt,
    })
    .from(auditLog)
    .leftJoin(clients, eq(clients.id, auditLog.clientId))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);
}
