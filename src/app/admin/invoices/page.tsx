import { requireAdmin } from '@/lib/auth/current-user';
import { getSignedUrls } from '@/lib/storage/upload';
import { InvoicesClient, type InvoiceOverviewWithUrl } from './InvoicesClient';
import { getAllInvoices, getInvoiceSummaryAll } from './queries';

export default async function InvoicesPage() {
  await requireAdmin();

  const [rows, summary] = await Promise.all([getAllInvoices(), getInvoiceSummaryAll()]);

  const urlMap =
    rows.length > 0 ? await getSignedUrls(rows.map((r) => r.storagePath)) : new Map<string, string>();

  const invoicesWithUrls: InvoiceOverviewWithUrl[] = rows.map((r) => ({
    ...r,
    signedUrl: urlMap.get(r.storagePath) ?? null,
  }));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-brand-teal-500 text-3xl">Invoices</h1>
        <p className="mt-1 text-sm text-[#737373]">
          Every invoice across the book. Per-client uploads live on each client&apos;s Invoices tab.
        </p>
      </header>

      <InvoicesClient invoices={invoicesWithUrls} summary={summary} />
    </div>
  );
}
