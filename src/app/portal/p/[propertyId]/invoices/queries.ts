// Read queries for the portal Invoices page. Pure read-only — clients
// can view and download but never change payment status (admin-only).

import { and, count, desc, eq, isNull, or, type SQL, sum } from 'drizzle-orm';
import { db } from '@/db';
import { invoices, projects, properties } from '@/db/schema';
import { getSignedUrls } from '@/lib/storage/upload';

export type InvoiceStatus = 'paid' | 'unpaid' | 'partial';

/**
 * Scope predicate for an invoice belonging to a given property. Invoices
 * carry an OPTIONAL `propertyId` — an invoice with no property assigned is
 * a client-level bill (e.g. a membership charge) that isn't tied to any one
 * home. We deliberately surface those on EVERY property's page (propertyId
 * matches OR propertyId IS NULL): hiding a bill entirely is worse than
 * showing it on each property, and the card renders no property label for
 * the unassigned ones so they don't misattribute. See the invoices page
 * for the UI treatment.
 *
 * Combined with the `clientId` equality the callers already apply, this is
 * "this client's invoices for this property, plus this client's
 * unassigned invoices".
 */
function invoicePropertyScope(propertyId: string): SQL | undefined {
  return or(eq(invoices.propertyId, propertyId), isNull(invoices.propertyId));
}

/** Ownership check shared by the invoice reads: the property must exist and
 *  belong to the signed-in client. Returns false when it doesn't, so the
 *  caller can short-circuit to an empty result. */
async function propertyBelongsToClient(clientId: string, propertyId: string): Promise<boolean> {
  const [property] = await db
    .select({ id: properties.id })
    .from(properties)
    .where(and(eq(properties.id, propertyId), eq(properties.clientId, clientId)))
    .limit(1);
  return Boolean(property);
}

export interface PortalInvoiceRow {
  id: string;
  invoiceNumber: string;
  description: string | null;
  amountCents: number;
  invoiceDate: string;
  dueDate: string;
  status: InvoiceStatus;
  storagePath: string;
  signedUrl: string | null;
  projectName: string | null;
  propertyName: string | null;
}

export interface PortalInvoiceSummary {
  totalInvoiced: number;
  totalPaid: number;
  totalOutstanding: number;
  invoiceCount: number;
}

export async function getClientInvoices(
  clientId: string,
  propertyId: string,
): Promise<PortalInvoiceRow[]> {
  if (!(await propertyBelongsToClient(clientId, propertyId))) return [];

  const rows = await db
    .select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      description: invoices.description,
      amountCents: invoices.amountCents,
      invoiceDate: invoices.invoiceDate,
      dueDate: invoices.dueDate,
      status: invoices.status,
      storagePath: invoices.storagePath,
      projectName: projects.name,
      propertyName: properties.name,
    })
    .from(invoices)
    .leftJoin(projects, eq(projects.id, invoices.projectId))
    .leftJoin(properties, eq(properties.id, invoices.propertyId))
    .where(and(eq(invoices.clientId, clientId), invoicePropertyScope(propertyId)))
    .orderBy(desc(invoices.invoiceDate));

  if (rows.length === 0) return [];

  // One batched signed-URL call rather than N round-trips. Empty paths
  // (shouldn't happen in practice, but defensive) are filtered out.
  const paths = rows.map((r) => r.storagePath).filter(Boolean);
  const urlByPath = paths.length > 0 ? await getSignedUrls(paths) : new Map<string, string>();

  return rows.map((r) => ({
    id: r.id,
    invoiceNumber: r.invoiceNumber,
    description: r.description,
    amountCents: r.amountCents,
    invoiceDate: r.invoiceDate,
    dueDate: r.dueDate,
    status: r.status as InvoiceStatus,
    storagePath: r.storagePath,
    signedUrl: r.storagePath ? (urlByPath.get(r.storagePath) ?? null) : null,
    projectName: r.projectName,
    propertyName: r.propertyName,
  }));
}

/**
 * Aggregate totals for the summary bar at the top of the invoices page.
 * Done via a separate grouped query so the database (not application
 * code) does the SUM — and so it works correctly even with a large
 * invoice history.
 */
export async function getClientInvoiceSummary(
  clientId: string,
  propertyId: string,
): Promise<PortalInvoiceSummary> {
  if (!(await propertyBelongsToClient(clientId, propertyId))) {
    return { totalInvoiced: 0, totalPaid: 0, totalOutstanding: 0, invoiceCount: 0 };
  }

  const rows = await db
    .select({
      status: invoices.status,
      total: sum(invoices.amountCents).mapWith(Number),
      count: count(),
    })
    .from(invoices)
    .where(and(eq(invoices.clientId, clientId), invoicePropertyScope(propertyId)))
    .groupBy(invoices.status);

  let totalInvoiced = 0;
  let totalPaid = 0;
  let totalOutstanding = 0;
  let invoiceCount = 0;

  for (const r of rows) {
    const amount = r.total ?? 0;
    invoiceCount += Number(r.count);
    totalInvoiced += amount;
    if (r.status === 'paid') totalPaid += amount;
    else totalOutstanding += amount;
  }

  return { totalInvoiced, totalPaid, totalOutstanding, invoiceCount };
}
