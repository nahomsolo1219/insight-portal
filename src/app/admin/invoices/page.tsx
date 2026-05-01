import { requireAdmin } from '@/lib/auth/current-user';
import { getSignedUrlsAdmin } from '@/lib/storage/upload';
import { InvoiceActivityChart } from './InvoiceActivityChart';
import { InvoiceCategoryPie } from './InvoiceCategoryPie';
import { InvoicesClient, type InvoiceOverviewWithUrl } from './InvoicesClient';
import {
  getAllInvoices,
  getInvoiceActivity,
  getInvoiceCategoryBreakdown,
  getInvoiceSummaryAll,
  type InvoiceActivityBucket,
} from './queries';

interface PageProps {
  searchParams: Promise<{ activity?: string }>;
}

export default async function InvoicesPage({ searchParams }: PageProps) {
  await requireAdmin();
  const { activity } = await searchParams;
  const bucket: InvoiceActivityBucket =
    activity === 'daily' ? 'daily' : activity === 'weekly' ? 'weekly' : 'monthly';

  const [rows, summary, breakdown, activityPoints] = await Promise.all([
    getAllInvoices(),
    getInvoiceSummaryAll(),
    getInvoiceCategoryBreakdown(),
    getInvoiceActivity(bucket),
  ]);

  const urlMap =
    rows.length > 0 ? await getSignedUrlsAdmin(rows.map((r) => r.storagePath)) : new Map<string, string>();

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
        activityChart={
          <InvoiceActivityChart bucket={bucket} points={activityPoints} />
        }
      />
    </div>
  );
}
