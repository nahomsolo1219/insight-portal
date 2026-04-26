// Read queries for the portal Invoices page. Pure read-only — clients
// can view and download but never change payment status (admin-only).

import { count, desc, eq, sum } from 'drizzle-orm';
import { db } from '@/db';
import { invoices, projects, properties } from '@/db/schema';
import { getSignedUrls } from '@/lib/storage/upload';

export type InvoiceStatus = 'paid' | 'unpaid' | 'partial';

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

export async function getClientInvoices(clientId: string): Promise<PortalInvoiceRow[]> {
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
    .where(eq(invoices.clientId, clientId))
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
): Promise<PortalInvoiceSummary> {
  const rows = await db
    .select({
      status: invoices.status,
      total: sum(invoices.amountCents).mapWith(Number),
      count: count(),
    })
    .from(invoices)
    .where(eq(invoices.clientId, clientId))
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
