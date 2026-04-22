// Cross-client invoice queries. Mirrors the per-client Invoices tab
// queries but with no client filter — every invoice in the system,
// joined to its client/property/project for display.

import { count, desc, eq, sum } from 'drizzle-orm';
import { db } from '@/db';
import { clients, invoices, projects, properties } from '@/db/schema';

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
