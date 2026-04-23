'use client';

import { ChevronDown, Download } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useOptimistic, useState, useTransition } from 'react';
import { Dropdown } from '@/components/admin/Dropdown';
import { useToast } from '@/components/admin/ToastProvider';
import { cn, formatCurrency, formatShortDate } from '@/lib/utils';
import {
  updateInvoiceStatus,
  type InvoiceStatus,
} from '../clients/[id]/invoices-actions';
import type { InvoiceOverviewRow, InvoiceSummaryAll } from './queries';

export type InvoiceOverviewWithUrl = InvoiceOverviewRow & { signedUrl: string | null };

const STATUS_OPTIONS: { id: InvoiceStatus; label: string; badge: string }[] = [
  { id: 'paid', label: 'Paid', badge: 'bg-emerald-50 text-emerald-700' },
  { id: 'unpaid', label: 'Unpaid', badge: 'bg-red-50 text-red-700' },
  { id: 'partial', label: 'Partial', badge: 'bg-amber-50 text-amber-700' },
];

const STATUS_FILTER_OPTIONS: { id: 'all' | InvoiceStatus; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'unpaid', label: 'Unpaid' },
  { id: 'partial', label: 'Partial' },
  { id: 'paid', label: 'Paid' },
];

function statusMeta(status: string) {
  return STATUS_OPTIONS.find((s) => s.id === status) ?? STATUS_OPTIONS[1];
}

interface InvoicesClientProps {
  invoices: InvoiceOverviewWithUrl[];
  summary: InvoiceSummaryAll;
}

export function InvoicesClient({ invoices, summary }: InvoicesClientProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [, startTransition] = useTransition();
  const [statusFilter, setStatusFilter] = useState<'all' | InvoiceStatus>('all');
  const [clientFilter, setClientFilter] = useState<string>('');

  // Optimistic status overlay — the filtered list + scoped summary below both
  // derive from `optimisticInvoices`, so both update the instant a badge flips.
  const [optimisticInvoices, applyOptimisticStatus] = useOptimistic(
    invoices,
    (state, action: { id: string; status: InvoiceStatus }) =>
      state.map((inv) => (inv.id === action.id ? { ...inv, status: action.status } : inv)),
  );

  function handleStatusChange(invoiceId: string, clientId: string, newStatus: InvoiceStatus) {
    startTransition(async () => {
      applyOptimisticStatus({ id: invoiceId, status: newStatus });
      const result = await updateInvoiceStatus(invoiceId, clientId, newStatus);
      if (!result.success) {
        showToast(result.error, 'error');
        return;
      }
      showToast(`Marked ${newStatus}`);
      router.refresh();
    });
  }

  const clientOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const inv of optimisticInvoices)
      if (!seen.has(inv.clientId)) seen.set(inv.clientId, inv.clientName);
    return Array.from(seen.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [optimisticInvoices]);

  const filtered = useMemo(() => {
    return optimisticInvoices.filter((inv) => {
      if (statusFilter !== 'all' && inv.status !== statusFilter) return false;
      if (clientFilter && inv.clientId !== clientFilter) return false;
      return true;
    });
  }, [optimisticInvoices, statusFilter, clientFilter]);

  // Filter-aware totals so the summary bar reflects whatever the user is
  // looking at, not the global book. Matches how David thinks about it —
  // "what's outstanding for the Andersons?" needs a scoped answer.
  const filteredSummary = useMemo(() => {
    let totalInvoiced = 0;
    let totalPaid = 0;
    let totalOutstanding = 0;
    for (const inv of filtered) {
      totalInvoiced += inv.amountCents;
      if (inv.status === 'paid') totalPaid += inv.amountCents;
      else totalOutstanding += inv.amountCents;
    }
    return {
      totalInvoiced,
      totalPaid,
      totalOutstanding,
      invoiceCount: filtered.length,
    };
  }, [filtered]);

  const hasFilters = statusFilter !== 'all' || Boolean(clientFilter);
  const activeSummary = hasFilters ? filteredSummary : summary;

  return (
    <div>
      <SummaryBar summary={activeSummary} scoped={hasFilters} />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <ToggleGroup options={STATUS_FILTER_OPTIONS} value={statusFilter} onChange={setStatusFilter} />
        {clientOptions.length > 1 && (
          <select
            value={clientFilter}
            onChange={(e) => setClientFilter(e.target.value)}
            className="focus:ring-brand-teal-200 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:ring-2 focus:outline-none"
          >
            <option value="">All clients</option>
            {clientOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {optimisticInvoices.length === 0 ? (
        <EmptyState />
      ) : filtered.length === 0 ? (
        <div className="shadow-card rounded-2xl bg-white p-12 text-center text-sm text-gray-400">
          No invoices match the current filters.
        </div>
      ) : (
        <InvoiceTable invoices={filtered} onStatusChange={handleStatusChange} />
      )}
    </div>
  );
}

// ---------- summary ----------

function SummaryBar({ summary, scoped }: { summary: InvoiceSummaryAll; scoped: boolean }) {
  return (
    <div className="mb-6 grid grid-cols-3 gap-5">
      <SummaryCard
        label={scoped ? 'Filtered invoiced' : 'Total invoiced'}
        value={formatCurrency(summary.totalInvoiced)}
        hint={
          summary.invoiceCount === 0
            ? 'No invoices'
            : `${summary.invoiceCount} ${summary.invoiceCount === 1 ? 'invoice' : 'invoices'}`
        }
      />
      <SummaryCard
        label="Paid"
        value={formatCurrency(summary.totalPaid)}
        tone={summary.totalPaid > 0 ? 'emerald' : 'default'}
      />
      <SummaryCard
        label="Outstanding"
        value={formatCurrency(summary.totalOutstanding)}
        tone={summary.totalOutstanding > 0 ? 'amber' : 'default'}
      />
    </div>
  );
}

function SummaryCard({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'emerald' | 'amber';
}) {
  const toneClass =
    tone === 'emerald'
      ? 'text-emerald-700'
      : tone === 'amber'
        ? 'text-amber-600'
        : 'text-gray-900';
  return (
    <div className="shadow-card rounded-2xl bg-white p-5">
      <div className="text-xs font-medium tracking-wider text-gray-500 uppercase">{label}</div>
      <div className={cn('mt-2 text-2xl font-light tracking-tight', toneClass)}>{value}</div>
      {hint && <div className="mt-1 text-xs text-gray-400">{hint}</div>}
    </div>
  );
}

// ---------- toggle group ----------

function ToggleGroup<V extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { id: V; label: string }[];
  value: V;
  onChange: (v: V) => void;
}) {
  return (
    <div className="bg-brand-warm-200 inline-flex gap-1 rounded-xl p-1">
      {options.map((opt) => {
        const isActive = opt.id === value;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            className={cn(
              'rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-all',
              isActive
                ? 'shadow-soft text-brand-teal-500 bg-white'
                : 'hover:text-brand-teal-500 text-gray-500',
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------- table ----------

function InvoiceTable({
  invoices,
  onStatusChange,
}: {
  invoices: InvoiceOverviewWithUrl[];
  onStatusChange: (invoiceId: string, clientId: string, status: InvoiceStatus) => void;
}) {
  return (
    <div className="shadow-card overflow-hidden rounded-2xl bg-white">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              <Th>Invoice #</Th>
              <Th>Client</Th>
              <Th>Description</Th>
              <Th align="right">Amount</Th>
              <Th>Invoice date</Th>
              <Th>Due date</Th>
              <Th>Status</Th>
              <Th align="right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <InvoiceRow key={inv.id} invoice={inv} onStatusChange={onStatusChange} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th
      className={cn(
        'px-4 py-3 text-xs font-medium tracking-wider text-gray-400 uppercase',
        align === 'right' ? 'text-right' : 'text-left',
      )}
    >
      {children}
    </th>
  );
}

function InvoiceRow({
  invoice,
  onStatusChange,
}: {
  invoice: InvoiceOverviewWithUrl;
  onStatusChange: (invoiceId: string, clientId: string, status: InvoiceStatus) => void;
}) {
  return (
    <tr className="hover:bg-brand-warm-50 border-b border-gray-50 transition-colors last:border-b-0">
      <td className="px-4 py-4 text-sm font-medium text-gray-900">{invoice.invoiceNumber}</td>
      <td className="px-4 py-4 text-sm">
        <Link
          href={`/admin/clients/${invoice.clientId}`}
          className="hover:text-brand-teal-500 font-medium text-gray-700 transition-colors"
        >
          {invoice.clientName}
        </Link>
      </td>
      <td className="max-w-[260px] px-4 py-4 text-sm text-gray-700">
        <div className="truncate" title={invoice.description ?? ''}>
          {invoice.description ?? '—'}
        </div>
        {invoice.projectName && (
          <div className="mt-0.5 truncate text-xs text-gray-400">{invoice.projectName}</div>
        )}
      </td>
      <td className="px-4 py-4 text-right text-sm font-medium tabular-nums text-gray-900">
        {formatCurrency(invoice.amountCents)}
      </td>
      <td className="px-4 py-4 text-sm text-gray-600">{formatShortDate(invoice.invoiceDate)}</td>
      <td className="px-4 py-4 text-sm text-gray-600">{formatShortDate(invoice.dueDate)}</td>
      <td className="px-4 py-4">
        <StatusBadgeButton
          invoiceId={invoice.id}
          clientId={invoice.clientId}
          status={invoice.status}
          onChange={onStatusChange}
        />
      </td>
      <td className="px-4 py-4">
        <div className="flex items-center justify-end gap-2">
          {invoice.signedUrl ? (
            <a
              href={invoice.signedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-teal-500 hover:text-brand-teal-600 hover:bg-brand-teal-50 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all"
            >
              <Download size={14} strokeWidth={1.5} />
              PDF
            </a>
          ) : (
            <span className="text-xs text-gray-400 italic">No PDF</span>
          )}
        </div>
      </td>
    </tr>
  );
}

// ---------- status dropdown (portal-based) ----------

function StatusBadgeButton({
  invoiceId,
  clientId,
  status,
  onChange,
}: {
  invoiceId: string;
  clientId: string;
  status: InvoiceStatus;
  onChange: (invoiceId: string, clientId: string, status: InvoiceStatus) => void;
}) {
  const meta = statusMeta(status);

  function choose(next: string) {
    if (next === status) return;
    onChange(invoiceId, clientId, next as InvoiceStatus);
  }

  return (
    <Dropdown
      value={status}
      onSelect={choose}
      ariaLabel="Change invoice status"
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-all',
        meta.badge,
        'hover:ring-2 hover:ring-gray-100',
      )}
      options={STATUS_OPTIONS.map((opt) => ({
        value: opt.id,
        label: opt.label,
        badge: (
          <span className={cn('rounded-md px-2 py-0.5 text-[11px] font-medium', opt.badge)}>
            {opt.label}
          </span>
        ),
      }))}
      trigger={
        <>
          {meta.label}
          <ChevronDown size={12} strokeWidth={2} className="opacity-60" />
        </>
      }
    />
  );
}

// ---------- empty state ----------

function EmptyState() {
  return (
    <div className="shadow-card rounded-2xl bg-white p-12 text-center">
      <h3 className="text-base font-semibold text-gray-900">No invoices yet</h3>
      <p className="mx-auto mt-2 max-w-sm text-sm text-gray-500">
        Invoices are uploaded per-client from the client detail page. Once any client has an
        invoice, it&apos;ll show up here.
      </p>
    </div>
  );
}
