// Server wrapper for the Invoices tab. Invoices are client-scoped (not
// property-scoped) — switching properties in the tab bar does NOT filter
// this list. Does three reads in parallel: the invoice list, the rollup
// summary, and every project across the client's properties (for the
// property→project cascade in the upload modal).

import { getSignedUrlsAdmin } from '@/lib/storage/upload';
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

  // ────────────────────────────────────────────────────────────────────
  // TEMP DIAGNOSTIC (remove after diagnosis): log the storage paths
  // we ask Supabase to sign, what comes back in the resolved Map, and
  // the per-row signedUrl resolution. Server-component logs land in
  // the Next.js server stdout (vercel logs / `npm run dev` terminal).
  // ────────────────────────────────────────────────────────────────────
  const pathsToSign = invoiceRows.map((i) => i.storagePath);
  console.log('[InvoicesTab/diag] clientId:', clientId);
  console.log('[InvoicesTab/diag] paths to sign:', pathsToSign);

  const urlMap =
    invoiceRows.length > 0
      ? await getSignedUrlsAdmin(pathsToSign)
      : new Map<string, string>();

  console.log('[InvoicesTab/diag] urlMap size:', urlMap.size);
  console.log('[InvoicesTab/diag] urlMap keys:', Array.from(urlMap.keys()));

  const invoicesWithUrls: InvoiceRowWithUrl[] = invoiceRows.map((i) => ({
    ...i,
    signedUrl: urlMap.get(i.storagePath) ?? null,
  }));

  console.log(
    '[InvoicesTab/diag] resolved rows:',
    invoicesWithUrls.map((i) => ({
      id: i.id,
      invoiceNumber: i.invoiceNumber,
      storagePath: i.storagePath,
      signedUrlPresent: i.signedUrl !== null,
      signedUrlPrefix: i.signedUrl ? i.signedUrl.slice(0, 80) + '…' : null,
    })),
  );

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
