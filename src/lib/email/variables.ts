import 'server-only';

/**
 * Variable resolution helpers for each email trigger. Each function
 * gathers the context variables needed to render its template by
 * doing the necessary DB joins. Runs with the app's default connection
 * (RLS bypassed since these run inside admin-gated server actions).
 */

import { eq } from 'drizzle-orm';
import { db } from '@/db';
import {
  clients,
  milestones,
  projects,
  properties,
  staff,
} from '@/db/schema';
import { formatCurrency } from '@/lib/utils';

const siteUrl = () => process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

async function getClientName(clientId: string): Promise<string> {
  const [row] = await db.select({ name: clients.name }).from(clients).where(eq(clients.id, clientId)).limit(1);
  return row?.name ?? 'there';
}

async function getClientEmail(clientId: string): Promise<string | null> {
  const [row] = await db.select({ email: clients.email }).from(clients).where(eq(clients.id, clientId)).limit(1);
  return row?.email ?? null;
}

async function getPmInfo(clientId: string): Promise<{ pmName: string; pmEmail: string }> {
  const [row] = await db
    .select({ pmId: clients.assignedPmId })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  if (!row?.pmId) return { pmName: 'Your project manager', pmEmail: '' };
  const [pm] = await db.select({ name: staff.name, email: staff.email }).from(staff).where(eq(staff.id, row.pmId)).limit(1);
  return { pmName: pm?.name ?? 'Your project manager', pmEmail: pm?.email ?? '' };
}

export async function getDecisionEmailVars(milestoneId: string, clientId: string) {
  const [ms] = await db
    .select({ title: milestones.title, projectId: milestones.projectId })
    .from(milestones)
    .where(eq(milestones.id, milestoneId))
    .limit(1);
  const projectId = ms?.projectId;
  const [proj] = projectId
    ? await db.select({ name: projects.name, propertyId: projects.propertyId }).from(projects).where(eq(projects.id, projectId)).limit(1)
    : [null];
  const [prop] = proj?.propertyId
    ? await db.select({ name: properties.name }).from(properties).where(eq(properties.id, proj.propertyId)).limit(1)
    : [null];

  const clientName = await getClientName(clientId);
  const { pmName } = await getPmInfo(clientId);

  return {
    client_name: clientName,
    project_name: proj?.name ?? 'your project',
    property_name: prop?.name ?? 'your property',
    decision_title: ms?.title ?? 'a decision',
    cta_url: `${siteUrl()}/portal`,
    pm_name: pmName,
  };
}

export async function getInvoiceEmailVars(
  clientId: string,
  invoiceNumber: string,
  amountCents: number,
  dueDate: string,
  description: string,
) {
  const clientName = await getClientName(clientId);
  const { pmName } = await getPmInfo(clientId);

  return {
    client_name: clientName,
    invoice_number: invoiceNumber,
    amount: formatCurrency(amountCents),
    due_date: dueDate,
    description,
    cta_url: `${siteUrl()}/portal`,
    pm_name: pmName,
  };
}

export async function getAppointmentEmailVars(
  clientId: string,
  title: string,
  date: string,
  startTime: string | null,
  propertyId: string,
) {
  const clientName = await getClientName(clientId);
  const { pmName } = await getPmInfo(clientId);
  const [prop] = await db.select({ name: properties.name }).from(properties).where(eq(properties.id, propertyId)).limit(1);

  return {
    client_name: clientName,
    appointment_title: title,
    date,
    time: startTime ?? 'TBD',
    property_name: prop?.name ?? 'your property',
    cta_url: `${siteUrl()}/portal`,
    pm_name: pmName,
  };
}

export async function getPhotosEmailVars(
  clientId: string,
  projectId: string | null,
  propertyId: string,
  photoCount: number,
) {
  const clientName = await getClientName(clientId);
  const { pmName } = await getPmInfo(clientId);
  const [proj] = projectId
    ? await db.select({ name: projects.name }).from(projects).where(eq(projects.id, projectId)).limit(1)
    : [null];
  const [prop] = await db.select({ name: properties.name }).from(properties).where(eq(properties.id, propertyId)).limit(1);

  return {
    client_name: clientName,
    project_name: proj?.name ?? 'your property',
    property_name: prop?.name ?? 'your property',
    photo_count: String(photoCount),
    cta_url: `${siteUrl()}/portal`,
    pm_name: pmName,
  };
}

export async function getWelcomeEmailVars(clientId: string) {
  const clientName = await getClientName(clientId);
  const { pmName, pmEmail } = await getPmInfo(clientId);

  return {
    client_name: clientName,
    cta_url: `${siteUrl()}/portal`,
    pm_name: pmName,
    pm_email: pmEmail,
  };
}

/** Resolve the client email for a given clientId. Returns null when no
 *  email is on file (the caller should skip sending). */
export { getClientEmail };
