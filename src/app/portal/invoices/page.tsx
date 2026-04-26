import { Download, FileText, MapPin } from 'lucide-react';
import { redirect } from 'next/navigation';
import { PdfViewer } from '@/components/portal/PdfViewer';
import { getCurrentUser } from '@/lib/auth/current-user';
import { cn, formatCurrency, formatDate } from '@/lib/utils';
import {
  getClientInvoices,
  getClientInvoiceSummary,
  type InvoiceStatus,
  type PortalInvoiceRow,
  type PortalInvoiceSummary,
} from './queries';

export default async function PortalInvoicesPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== 'client' || !user.clientId) redirect('/');

  const [invoices, summary] = await Promise.all([
    getClientInvoices(user.clientId),
    getClientInvoiceSummary(user.clientId),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-brand-teal-500 text-2xl tracking-tight md:text-3xl">
          Invoices
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Statements and payment status. Your project manager handles all billing — no
          action needed from you.
        </p>
      </header>

      <SummaryBar summary={summary} />

      {invoices.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-3">
          {invoices.map((inv) => (
            <InvoiceCard key={inv.id} invoice={inv} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Summary bar
// ---------------------------------------------------------------------------

function SummaryBar({ summary }: { summary: PortalInvoiceSummary }) {
  return (
    <div className="shadow-card grid grid-cols-3 gap-4 rounded-2xl bg-white p-5">
      <SummaryStat
        label="Total invoiced"
        value={formatCurrency(summary.totalInvoiced)}
      />
      <SummaryStat
        label="Paid"
        value={formatCurrency(summary.totalPaid)}
        tone={summary.totalPaid > 0 ? 'emerald' : 'default'}
      />
      <SummaryStat
        label="Outstanding"
        value={formatCurrency(summary.totalOutstanding)}
        tone={summary.totalOutstanding > 0 ? 'amber' : 'default'}
      />
    </div>
  );
}

function SummaryStat({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'emerald' | 'amber';
}) {
  const valueClass =
    tone === 'emerald'
      ? 'text-emerald-700'
      : tone === 'amber'
        ? 'text-amber-600'
        : 'text-gray-900';
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-medium tracking-wider text-gray-500 uppercase">
        {label}
      </div>
      <div
        className={cn(
          // Light weight at large size matches the admin's premium feel.
          // tabular-nums keeps the dollar amounts column-aligned across
          // the three stats on mobile.
          'mt-1 text-xl font-light tracking-tight tabular-nums md:text-2xl',
          valueClass,
        )}
      >
        {value}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Invoice card
// ---------------------------------------------------------------------------

function InvoiceCard({ invoice }: { invoice: PortalInvoiceRow }) {
  return (
    <div className="shadow-card rounded-2xl bg-white p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold text-gray-900">
          #{invoice.invoiceNumber}
        </h3>
        <span className="text-base font-light tabular-nums text-gray-900 md:text-lg">
          {formatCurrency(invoice.amountCents)}
        </span>
      </div>

      {invoice.description && (
        <p className="mt-1 text-sm text-gray-700">{invoice.description}</p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
        <span>{formatDate(invoice.invoiceDate)}</span>
        <span className="text-gray-300">·</span>
        <span>Due {formatDate(invoice.dueDate)}</span>
        {invoice.propertyName && (
          <>
            <span className="text-gray-300">·</span>
            <span className="inline-flex items-center gap-1">
              <MapPin size={11} strokeWidth={1.5} />
              {invoice.propertyName}
            </span>
          </>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <StatusBadge status={invoice.status} />
        {invoice.signedUrl ? (
          <div className="flex items-center gap-1">
            <PdfViewer url={invoice.signedUrl} name={`Invoice #${invoice.invoiceNumber}.pdf`} />
            <a
              href={invoice.signedUrl}
              target="_blank"
              rel="noopener noreferrer"
              // 44px touch target on mobile.
              className="text-brand-teal-500 hover:text-brand-teal-600 hover:bg-brand-teal-50 inline-flex h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-medium transition-all md:px-4"
            >
              <Download size={14} strokeWidth={1.75} />
              <span className="hidden sm:inline">Download</span>
            </a>
          </div>
        ) : (
          <span className="text-xs text-gray-400 italic">PDF unavailable</span>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: InvoiceStatus }) {
  const meta =
    status === 'paid'
      ? { label: 'Paid', dot: 'bg-emerald-500', wrap: 'bg-emerald-50 text-emerald-700' }
      : status === 'partial'
        ? { label: 'Partial', dot: 'bg-amber-500', wrap: 'bg-amber-50 text-amber-700' }
        : { label: 'Unpaid', dot: 'bg-red-500', wrap: 'bg-red-50 text-red-700' };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
        meta.wrap,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', meta.dot)} />
      {meta.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <div className="shadow-card rounded-2xl bg-white p-10 text-center">
      <div className="bg-brand-warm-200 mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full text-gray-400">
        <FileText size={20} strokeWidth={1.25} />
      </div>
      <h3 className="text-base font-semibold text-gray-900">No invoices yet</h3>
      <p className="mx-auto mt-2 max-w-sm text-sm text-gray-500">
        Invoices will appear here as your projects progress. Your project manager
        handles all billing — no action needed from you.
      </p>
    </div>
  );
}
