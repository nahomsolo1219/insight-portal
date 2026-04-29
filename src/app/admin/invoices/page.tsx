import { requireAdmin } from '@/lib/auth/current-user';
import { getSignedUrls } from '@/lib/storage/upload';
import { InvoiceCategoryPie } from './InvoiceCategoryPie';
import { InvoicesClient, type InvoiceOverviewWithUrl } from './InvoicesClient';
import {
  getAllInvoices,
  getInvoiceCategoryBreakdown,
  getInvoiceSummaryAll,
} from './queries';

export default async function InvoicesPage() {
  await requireAdmin();

  const [rows, summary, breakdown] = await Promise.all([
    getAllInvoices(),
    getInvoiceSummaryAll(),
    getInvoiceCategoryBreakdown(),
  ]);

  const urlMap =
    rows.length > 0 ? await getSignedUrls(rows.map((r) => r.storagePath)) : new Map<string, string>();

  const invoicesWithUrls: InvoiceOverviewWithUrl[] = rows.map((r) => ({
    ...r,
    signedUrl: urlMap.get(r.storagePath) ?? null,
  }));

  return (
    <div className="space-y-6">
      <header>
        <div className="mb-3 flex items-center gap-2">
          <span aria-hidden="true" className="bg-brand-gold-500 inline-block h-px w-8" />
          <span className="text-ink-500 text-[11px] font-medium uppercase tracking-[0.18em]">
            Financial
          </span>
        </div>
        <h1 className="text-ink-900 text-3xl font-light tracking-tight">Invoices</h1>
        <p className="mt-1 text-sm text-[#737373]">
          Every invoice across the book. Per-client uploads live on each client&apos;s Invoices tab.
        </p>
      </header>

      <InvoicesClient
        invoices={invoicesWithUrls}
        summary={summary}
        breakdownChart={<InvoiceCategoryPie buckets={breakdown} />}
      />
    </div>
  );
}
