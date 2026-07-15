import { Download, FileText, MapPin } from 'lucide-react';
import Link from 'next/link';
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

// Open vs paid split — David asked for "a folder for past 'paid' invoices
// as well as the new or open ones." Open = anything still owed
// (unpaid/partial); Paid = settled; All = both. URL-stateful (?status=)
// so a tab is linkable and survives refresh.
type StatusFilter = 'open' | 'paid' | 'all';

const OPEN_STATUSES: ReadonlySet<InvoiceStatus> = new Set(['unpaid', 'partial']);

function parseStatusFilter(raw: string | undefined): StatusFilter {
  return raw === 'paid' ? 'paid' : raw === 'all' ? 'all' : 'open';
}

function matchesFilter(status: InvoiceStatus, filter: StatusFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'paid') return status === 'paid';
  return OPEN_STATUSES.has(status);
}

export default async function PortalInvoicesPage({
  params,
  searchParams,
}: {
  params: Promise<{ propertyId: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const [{ propertyId }, { status: statusParam }] = await Promise.all([params, searchParams]);
  const user = await getCurrentUser();
  if (!user || user.role !== 'client' || !user.clientId) redirect('/');

  const filter = parseStatusFilter(statusParam);

  const [invoices, summary] = await Promise.all([
    getClientInvoices(user.clientId, propertyId),
    getClientInvoiceSummary(user.clientId, propertyId),
  ]);

  // Counts drive the tab labels; derived from the full property-scoped set
  // so the numbers don't move as the client switches tabs.
  const counts = {
    all: invoices.length,
    open: invoices.filter((i) => OPEN_STATUSES.has(i.status)).length,
    paid: invoices.filter((i) => i.status === 'paid').length,
  };
  const visible = invoices.filter((i) => matchesFilter(i.status, filter));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-brand-teal-500 text-2xl tracking-tight md:text-3xl">
          Invoices
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Statements and payment status. Your Insight Point of Contact handles all billing — no
          action needed from you.
        </p>
      </header>

      {/* Summary stays GLOBAL (all statuses for this property): the Paid vs
          Outstanding breakdown is only meaningful when both are shown — a
          per-tab summary would zero out one column. The tabs filter the
          list below, not the overview. */}
      <SummaryBar summary={summary} />

      {invoices.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <StatusTabs propertyId={propertyId} current={filter} counts={counts} />
          {visible.length === 0 ? (
            <FilteredEmpty propertyId={propertyId} filter={filter} />
          ) : (
            <div className="space-y-3">
              {visible.map((inv) => (
                <InvoiceCard key={inv.id} invoice={inv} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status tabs — Open / Paid / All. Link-based so the URL is the source of
// truth (matches the admin clients list's URL-driven filter tabs), styled
// for the portal's cream/ink/teal surface.
// ---------------------------------------------------------------------------

function invoicesHref(propertyId: string, filter: StatusFilter): string {
  const base = `/portal/p/${propertyId}/invoices`;
  // Omit the param for the default tab so the canonical URL stays clean.
  return filter === 'open' ? base : `${base}?status=${filter}`;
}

function StatusTabs({
  propertyId,
  current,
  counts,
}: {
  propertyId: string;
  current: StatusFilter;
  counts: { all: number; open: number; paid: number };
}) {
  const tabs: ReadonlyArray<{ id: StatusFilter; label: string; count: number }> = [
    { id: 'open', label: 'Open', count: counts.open },
    { id: 'paid', label: 'Paid', count: counts.paid },
    { id: 'all', label: 'All', count: counts.all },
  ];

  return (
    <nav aria-label="Filter invoices" className="flex flex-wrap gap-2">
      {tabs.map((t) => {
        const active = t.id === current;
        return (
          <Link
            key={t.id}
            href={invoicesHref(propertyId, t.id)}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
              active
                ? 'bg-brand-teal-500 text-white'
                : 'bg-white text-gray-600 shadow-card hover:text-brand-teal-500',
            )}
          >
            {t.label}
            <span
              className={cn(
                'rounded-full px-1.5 text-xs font-semibold tabular-nums',
                active ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500',
              )}
            >
              {t.count}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

function FilteredEmpty({ propertyId, filter }: { propertyId: string; filter: StatusFilter }) {
  const label = filter === 'paid' ? 'paid' : 'open';
  return (
    <div className="shadow-card rounded-2xl bg-white p-8 text-center">
      <p className="text-sm text-gray-500">
        No {label} invoices.{' '}
        <Link href={invoicesHref(propertyId, 'all')} className="text-brand-teal-500 hover:underline">
          Show all
        </Link>
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Summary bar
// ---------------------------------------------------------------------------

function SummaryBar({ summary }: { summary: PortalInvoiceSummary }) {
  return (
    <div className="shadow-card grid grid-cols-1 gap-4 rounded-2xl bg-white p-5 sm:grid-cols-3">
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
        Invoices will appear here as your projects progress. Your Insight Point of Contact
        handles all billing — no action needed from you.
      </p>
    </div>
  );
}
