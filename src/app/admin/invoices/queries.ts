// Cross-client invoice queries. Mirrors the per-client Invoices tab
// queries but with no client filter — every invoice in the system,
// joined to its client/property/project for display.

import { count, desc, eq, sum } from 'drizzle-orm';
import { db } from '@/db';
import { clients, invoices, projects, properties } from '@/db/schema';

/** Bucket key for the financial-breakdown chart. The schema has no
 *  `invoices.category` column, so we infer from the linked project's
 *  `type` and fall back to `Unassigned` for invoices without a project
 *  link. Adding a real category column later is a future migration. */
export type InvoiceCategory = 'Remodel' | 'Maintenance' | 'Unassigned';

export interface InvoiceCategoryBucket {
  category: InvoiceCategory;
  totalCents: number;
  invoiceCount: number;
}

export interface InvoiceOverviewRow {
  id: string;
  invoiceNumber: string;
  description: string | null;
  amountCents: number;
  invoiceDate: string;
  dueDate: string;
  status: 'paid' | 'unpaid' | 'partial';
  storagePath: string;
  clientId: string;
  clientName: string;
  projectName: string | null;
  propertyName: string | null;
}

export async function getAllInvoices(): Promise<InvoiceOverviewRow[]> {
  return db
    .select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      description: invoices.description,
      amountCents: invoices.amountCents,
      invoiceDate: invoices.invoiceDate,
      dueDate: invoices.dueDate,
      status: invoices.status,
      storagePath: invoices.storagePath,
      clientId: clients.id,
      clientName: clients.name,
      projectName: projects.name,
      propertyName: properties.name,
    })
    .from(invoices)
    .innerJoin(clients, eq(clients.id, invoices.clientId))
    .leftJoin(projects, eq(projects.id, invoices.projectId))
    .leftJoin(properties, eq(properties.id, invoices.propertyId))
    .orderBy(desc(invoices.invoiceDate), desc(invoices.createdAt));
}

export interface InvoiceSummaryAll {
  totalInvoiced: number;
  totalPaid: number;
  totalOutstanding: number;
  invoiceCount: number;
}

/**
 * Total invoiced + invoice count per category (Remodel / Maintenance /
 * Unassigned). Drives the financial-breakdown pie chart on the
 * /admin/invoices page. Returns ordered buckets with zero-amount
 * categories filtered out so the pie never renders an empty slice.
 *
 * Schema note: there's no `invoices.category` column. We left-join the
 * invoice's project and bucket on `projects.type`; invoices without a
 * project (e.g. one-off renderings, quick estimates) fall into
 * `Unassigned`.
 */
export async function getInvoiceCategoryBreakdown(): Promise<InvoiceCategoryBucket[]> {
  const rows = await db
    .select({
      projectType: projects.type,
      total: sum(invoices.amountCents).mapWith(Number),
      count: count(),
    })
    .from(invoices)
    .leftJoin(projects, eq(projects.id, invoices.projectId))
    .groupBy(projects.type);

  // Project enum is `'maintenance' | 'remodel'`. The left-join can also
  // surface NULL when the invoice has no project link.
  const labelFor = (raw: 'maintenance' | 'remodel' | null): InvoiceCategory => {
    if (raw === 'remodel') return 'Remodel';
    if (raw === 'maintenance') return 'Maintenance';
    return 'Unassigned';
  };

  // Stable order across renders so the pie + legend don't reshuffle —
  // Remodel first (typically the largest dollar slice), Maintenance,
  // Unassigned last.
  const order: InvoiceCategory[] = ['Remodel', 'Maintenance', 'Unassigned'];
  const totals = new Map<InvoiceCategory, { totalCents: number; invoiceCount: number }>();
  for (const row of rows) {
    const label = labelFor(row.projectType);
    const amount = row.total ?? 0;
    if (amount === 0) continue;
    const existing = totals.get(label);
    if (existing) {
      existing.totalCents += amount;
      existing.invoiceCount += Number(row.count);
    } else {
      totals.set(label, { totalCents: amount, invoiceCount: Number(row.count) });
    }
  }

  return order
    .map<InvoiceCategoryBucket | null>((category) => {
      const bucket = totals.get(category);
      if (!bucket) return null;
      return {
        category,
        totalCents: bucket.totalCents,
        invoiceCount: bucket.invoiceCount,
      };
    })
    .filter((b): b is InvoiceCategoryBucket => b !== null);
}

export async function getInvoiceSummaryAll(): Promise<InvoiceSummaryAll> {
  const rows = await db
    .select({
      status: invoices.status,
      total: sum(invoices.amountCents).mapWith(Number),
      count: count(),
    })
    .from(invoices)
    .groupBy(invoices.status);

  let totalInvoiced = 0;
  let totalPaid = 0;
  let totalOutstanding = 0;
  let invoiceCount = 0;

  for (const row of rows) {
    const amount = row.total ?? 0;
    invoiceCount += Number(row.count);
    totalInvoiced += amount;
    if (row.status === 'paid') totalPaid += amount;
    else totalOutstanding += amount;
  }

  return { totalInvoiced, totalPaid, totalOutstanding, invoiceCount };
}
