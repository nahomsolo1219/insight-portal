// Server wrapper for the Invoices tab. Invoices are client-scoped (not
// property-scoped) — switching properties in the tab bar does NOT filter
// this list. Does three reads in parallel: the invoice list, the rollup
// summary, and every project across the client's properties (for the
// property→project cascade in the upload modal).

import { getSignedUrls } from '@/lib/storage/upload';
import { InvoicesTabClient } from './InvoicesTabClient';
import {
  getAllProjectsForClient,
  getInvoiceSummaryForClient,
  getInvoicesForClient,
  type InvoiceRow,
} from './queries';

export interface InvoicesTabProperty {
  id: string;
  name: string;
}

interface InvoicesTabProps {
  clientId: string;
  properties: InvoicesTabProperty[];
}

export type InvoiceRowWithUrl = InvoiceRow & { signedUrl: string | null };

export async function InvoicesTab({ clientId, properties }: InvoicesTabProps) {
  const [invoiceRows, summary, allProjects] = await Promise.all([
    getInvoicesForClient(clientId),
    getInvoiceSummaryForClient(clientId),
    getAllProjectsForClient(clientId),
  ]);

  const urlMap =
    invoiceRows.length > 0
      ? await getSignedUrls(invoiceRows.map((i) => i.storagePath))
      : new Map<string, string>();

  const invoicesWithUrls: InvoiceRowWithUrl[] = invoiceRows.map((i) => ({
    ...i,
    signedUrl: urlMap.get(i.storagePath) ?? null,
  }));

  return (
    <InvoicesTabClient
      clientId={clientId}
      invoices={invoicesWithUrls}
      summary={summary}
      properties={properties}
      projects={allProjects}
    />
  );
}
