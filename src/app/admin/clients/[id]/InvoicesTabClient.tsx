'use client';

import { ChevronDown, Download, FileText, Plus, Trash2, Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useOptimistic, useState, useTransition } from 'react';
import { Dropdown } from '@/components/admin/Dropdown';
import { Field, inputClass } from '@/components/admin/Field';
import { FileUpload, type FileUploadItem } from '@/components/admin/FileUpload';
import { LoadingDots } from '@/components/admin/LoadingDots';
import { Modal } from '@/components/admin/Modal';
import { useToast } from '@/components/admin/ToastProvider';
import { cn, formatCurrency, formatShortDate } from '@/lib/utils';
import type { InvoiceRowWithUrl, InvoicesTabProperty } from './InvoicesTab';
import {
  createInvoice,
  deleteInvoice,
  updateInvoiceStatus,
  type InvoiceStatus,
} from './invoices-actions';
import type { InvoiceSummary, ProjectOptionWithProperty } from './queries';

const STATUS_OPTIONS: { id: InvoiceStatus; label: string; badge: string }[] = [
  { id: 'paid', label: 'Paid', badge: 'bg-emerald-50 text-emerald-700' },
  { id: 'unpaid', label: 'Unpaid', badge: 'bg-red-50 text-red-700' },
  { id: 'partial', label: 'Partial', badge: 'bg-amber-50 text-amber-700' },
];

function statusMeta(status: string) {
  return STATUS_OPTIONS.find((s) => s.id === status) ?? STATUS_OPTIONS[1];
}

interface InvoicesTabClientProps {
  clientId: string;
  invoices: InvoiceRowWithUrl[];
  summary: InvoiceSummary;
  properties: InvoicesTabProperty[];
  projects: ProjectOptionWithProperty[];
}

export function InvoicesTabClient({
  clientId,
  invoices,
  summary,
  properties,
  projects,
}: InvoicesTabClientProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [, startTransition] = useTransition();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<InvoiceRowWithUrl | null>(null);

  // Optimistic status overlay. The reducer "sets" the status (not "toggles")
  // so replaying the action against the refreshed server data is a no-op.
  const [optimisticInvoices, applyOptimisticStatus] = useOptimistic(
    invoices,
    (state, action: { id: string; status: InvoiceStatus }) =>
      state.map((inv) => (inv.id === action.id ? { ...inv, status: action.status } : inv)),
  );

  // Derive the summary from optimistic invoices so the Paid / Outstanding
  // counters move at the same instant the badge flips color. Server-rendered
  // `summary` is only used as a sanity fallback when no invoices are loaded.
  const liveSummary = useMemo(() => {
    if (optimisticInvoices.length === 0) return summary;
    let totalInvoiced = 0;
    let totalPaid = 0;
    let totalOutstanding = 0;
    for (const inv of optimisticInvoices) {
      totalInvoiced += inv.amountCents;
      if (inv.status === 'paid') totalPaid += inv.amountCents;
      else totalOutstanding += inv.amountCents;
    }
    return {
      totalInvoiced,
      totalPaid,
      totalOutstanding,
      invoiceCount: optimisticInvoices.length,
    };
  }, [optimisticInvoices, summary]);

  function handleStatusChange(invoiceId: string, newStatus: InvoiceStatus) {
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

  return (
    <div>
      <SummaryBar summary={liveSummary} />

      <div className="mb-5 flex items-center justify-between">
        <div className="text-sm text-gray-500">
          {optimisticInvoices.length} {optimisticInvoices.length === 1 ? 'invoice' : 'invoices'}
        </div>
        <button
          type="button"
          onClick={() => setUploadOpen(true)}
          className="bg-brand-gold-400 hover:bg-brand-gold-500 shadow-soft inline-flex items-center gap-2 rounded-xl px-5 py-2.5 font-medium text-white transition-all duration-150"
        >
          <Upload size={16} strokeWidth={2} />
          Upload invoice
        </button>
      </div>

      {optimisticInvoices.length === 0 ? (
        <EmptyState onUploadClick={() => setUploadOpen(true)} />
      ) : (
        <InvoiceTable
          invoices={optimisticInvoices}
          onStatusChange={handleStatusChange}
          onDelete={setDeleteTarget}
        />
      )}

      {uploadOpen && (
        <UploadModal
          onClose={() => setUploadOpen(false)}
          clientId={clientId}
          properties={properties}
          projects={projects}
        />
      )}

      {deleteTarget && (
        <DeleteConfirmModal
          invoice={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          clientId={clientId}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Summary bar
// ---------------------------------------------------------------------------

function SummaryBar({ summary }: { summary: InvoiceSummary }) {
  return (
    <div className="mb-6 grid grid-cols-3 gap-5">
      <SummaryCard
        label="Total invoiced"
        value={formatCurrency(summary.totalInvoiced)}
        hint={
          summary.invoiceCount === 0
            ? 'No invoices yet'
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

interface SummaryCardProps {
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'emerald' | 'amber';
}

function SummaryCard({ label, value, hint, tone = 'default' }: SummaryCardProps) {
  const toneClass =
    tone === 'emerald'
      ? 'text-emerald-700'
      : tone === 'amber'
        ? 'text-amber-600'
        : 'text-gray-900';
  return (
    <div className="shadow-soft-md rounded-2xl bg-paper p-5">
      <div className="text-xs font-medium tracking-wider text-gray-500 uppercase">{label}</div>
      <div className={cn('mt-2 serif text-2xl font-light tracking-tight', toneClass)}>{value}</div>
      {hint && <div className="mt-1 text-xs text-gray-400">{hint}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

interface InvoiceTableProps {
  invoices: InvoiceRowWithUrl[];
  onStatusChange: (invoiceId: string, status: InvoiceStatus) => void;
  onDelete: (invoice: InvoiceRowWithUrl) => void;
}

function InvoiceTable({ invoices, onStatusChange, onDelete }: InvoiceTableProps) {
  return (
    <div className="shadow-soft-md overflow-hidden rounded-2xl bg-paper">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-line-2">
              <Th>Invoice #</Th>
              <Th>Description</Th>
              <Th align="right">Amount</Th>
              <Th>Invoice date</Th>
              <Th>Due date</Th>
              <Th>Status</Th>
              <Th>Project</Th>
              <Th align="right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <InvoiceTableRow
                key={inv.id}
                invoice={inv}
                onStatusChange={onStatusChange}
                onDelete={() => onDelete(inv)}
              />
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

interface InvoiceTableRowProps {
  invoice: InvoiceRowWithUrl;
  onStatusChange: (invoiceId: string, status: InvoiceStatus) => void;
  onDelete: () => void;
}

function InvoiceTableRow({ invoice, onStatusChange, onDelete }: InvoiceTableRowProps) {
  return (
    <tr className="hover:bg-brand-warm-50 border-b border-gray-50 transition-colors last:border-b-0">
      <td className="px-4 py-4 text-sm font-medium text-gray-900">{invoice.invoiceNumber}</td>
      <td className="max-w-[260px] px-4 py-4 text-sm text-gray-700">
        <div className="truncate" title={invoice.description ?? ''}>
          {invoice.description ?? '—'}
        </div>
        {invoice.propertyName && (
          <div className="mt-0.5 truncate text-xs text-gray-400">{invoice.propertyName}</div>
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
          status={invoice.status}
          onChange={onStatusChange}
        />
      </td>
      <td className="px-4 py-4 text-sm text-gray-600">{invoice.projectName ?? '—'}</td>
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
          <button
            type="button"
            onClick={onDelete}
            aria-label={`Delete invoice ${invoice.invoiceNumber}`}
            className="rounded-lg p-1.5 text-gray-400 transition-all hover:bg-red-50 hover:text-red-500"
          >
            <Trash2 size={16} strokeWidth={1.5} />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Inline status dropdown (portal-based — escapes card `overflow-hidden`)
// ---------------------------------------------------------------------------

interface StatusBadgeButtonProps {
  invoiceId: string;
  status: InvoiceStatus;
  onChange: (invoiceId: string, status: InvoiceStatus) => void;
}

function StatusBadgeButton({ invoiceId, status, onChange }: StatusBadgeButtonProps) {
  const meta = statusMeta(status);

  function choose(next: string) {
    if (next === status) return;
    onChange(invoiceId, next as InvoiceStatus);
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

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({ onUploadClick }: { onUploadClick: () => void }) {
  return (
    <div className="shadow-soft-md rounded-2xl bg-paper p-12 text-center">
      <div className="bg-brand-warm-200 mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full text-gray-400">
        <FileText size={24} strokeWidth={1.5} />
      </div>
      <h3 className="text-base font-semibold text-gray-900">No invoices yet</h3>
      <p className="mx-auto mt-2 max-w-sm text-sm text-gray-500">
        Upload invoice PDFs here. Each one carries structured fields so you can track payment
        without opening the document.
      </p>
      <button
        type="button"
        onClick={onUploadClick}
        className="bg-brand-gold-400 hover:bg-brand-gold-500 shadow-soft mt-5 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 font-medium text-white transition-all"
      >
        <Plus size={16} />
        Upload invoice
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Upload modal
// ---------------------------------------------------------------------------

interface UploadModalProps {
  onClose: () => void;
  clientId: string;
  properties: InvoicesTabProperty[];
  projects: ProjectOptionWithProperty[];
}

function UploadModal({ onClose, clientId, properties, projects }: UploadModalProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [description, setDescription] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(today);
  const [dueDate, setDueDate] = useState(today);
  const [status, setStatus] = useState<InvoiceStatus>('unpaid');
  const [propertyId, setPropertyId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [files, setFiles] = useState<FileUploadItem[]>([]);

  // Filter projects to the selected property. With no property selected,
  // showing every project across the client would risk picking a project
  // whose implied property doesn't match — so we keep the project picker
  // disabled until a property is chosen.
  const filteredProjects = useMemo(
    () => (propertyId ? projects.filter((p) => p.propertyId === propertyId) : []),
    [projects, propertyId],
  );

  // Clear the project selection whenever the property changes. Done as an
  // explicit handler (not a useEffect) so we don't trigger a cascading
  // render — react-hooks/set-state-in-effect flags the effect variant.
  function handlePropertyChange(nextPropertyId: string) {
    setPropertyId(nextPropertyId);
    setProjectId('');
  }

  const parsedCents = useMemo(() => parseDollarsToCents(amountInput), [amountInput]);
  const amountPreview =
    parsedCents !== null && parsedCents > 0 ? formatCentsExact(parsedCents) : null;

  function submit() {
    setError(null);
    if (!invoiceNumber.trim()) {
      setError('Invoice number is required.');
      return;
    }
    if (!description.trim()) {
      setError('Description is required.');
      return;
    }
    if (parsedCents === null || parsedCents <= 0) {
      setError('Enter a valid dollar amount greater than zero.');
      return;
    }
    if (!invoiceDate) {
      setError('Invoice date is required.');
      return;
    }
    if (!dueDate) {
      setError('Due date is required.');
      return;
    }
    if (files.length === 0) {
      setError('Please attach the invoice PDF.');
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.append('file', files[0].file);

      const result = await createInvoice(
        clientId,
        {
          invoiceNumber: invoiceNumber.trim(),
          description: description.trim(),
          amountCents: parsedCents,
          invoiceDate,
          dueDate,
          status,
          propertyId: propertyId || null,
          projectId: projectId || null,
        },
        formData,
      );

      if (!result.success) {
        setError(result.error);
        showToast(result.error, 'error');
        return;
      }

      showToast(`Invoice ${invoiceNumber.trim()} uploaded`);
      onClose();
      router.refresh();
    });
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Upload invoice"
      size="lg"
      locked={isPending}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="rounded-xl px-5 py-2.5 font-medium text-gray-700 transition-all hover:bg-gray-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={isPending}
            className="bg-brand-gold-400 hover:bg-brand-gold-500 shadow-soft rounded-xl px-5 py-2.5 font-medium text-white transition-all disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? (
              <>
                Uploading
                <LoadingDots />
              </>
            ) : (
              'Upload invoice'
            )}
          </button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Invoice number" required>
            <input
              type="text"
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              placeholder="e.g. 0042"
              className={inputClass}
            />
          </Field>
          <Field label="Amount" required hint={amountPreview ? `Will save as ${amountPreview}` : 'Dollars — commas optional'}>
            <div className="relative">
              <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-sm text-gray-400">
                $
              </span>
              <input
                type="text"
                inputMode="decimal"
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                placeholder="46,250.00"
                className={cn(inputClass, 'pl-8')}
              />
            </div>
          </Field>
        </div>

        <Field label="Description" required>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Kitchen remodel — deposit"
            className={inputClass}
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Invoice date" required>
            <input
              type="date"
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Due date" required>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>

        <Field label="Payment status" required>
          <div className="grid grid-cols-3 gap-2">
            {STATUS_OPTIONS.map((opt) => {
              const isActive = status === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setStatus(opt.id)}
                  className={cn(
                    'flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-all',
                    isActive
                      ? 'border-brand-teal-500 bg-brand-teal-50 text-brand-teal-500'
                      : 'hover:border-brand-teal-200 hover:text-brand-teal-500 border-line text-gray-600',
                  )}
                >
                  <span className={cn('rounded px-1.5 py-0.5 text-[10px]', opt.badge)}>
                    {opt.label}
                  </span>
                </button>
              );
            })}
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field
            label="Property"
            hint={properties.length === 0 ? 'No properties yet' : 'Optional'}
          >
            <select
              value={propertyId}
              onChange={(e) => handlePropertyChange(e.target.value)}
              disabled={properties.length === 0}
              className={inputClass}
            >
              <option value="">— None —</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="Project"
            hint={
              !propertyId
                ? 'Select a property first'
                : filteredProjects.length === 0
                  ? 'No projects on this property'
                  : 'Optional'
            }
          >
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              disabled={!propertyId || filteredProjects.length === 0}
              className={inputClass}
            >
              <option value="">— None —</option>
              {filteredProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="PDF" required hint="Single PDF. Max 25 MB.">
          <FileUpload
            kind="pdf"
            multiple={false}
            maxFiles={1}
            onChange={setFiles}
            disabled={isPending}
          />
        </Field>

        {error && (
          <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Delete confirmation
// ---------------------------------------------------------------------------

interface DeleteConfirmModalProps {
  invoice: InvoiceRowWithUrl;
  onClose: () => void;
  clientId: string;
}

function DeleteConfirmModal({ invoice, onClose, clientId }: DeleteConfirmModalProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await deleteInvoice(invoice.id, clientId);
      if (!result.success) {
        setError(result.error);
        showToast(result.error, 'error');
        return;
      }
      showToast('Invoice deleted');
      onClose();
      router.refresh();
    });
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Delete invoice?"
      size="sm"
      locked={isPending}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="rounded-xl px-5 py-2.5 font-medium text-gray-700 transition-all hover:bg-gray-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={isPending}
            className="shadow-soft rounded-xl bg-red-500 px-5 py-2.5 font-medium text-white transition-all hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? (
              <>
                Deleting
                <LoadingDots />
              </>
            ) : (
              'Delete'
            )}
          </button>
        </>
      }
    >
      <p className="mb-3 text-sm text-gray-700">
        You&apos;re about to delete invoice{' '}
        <strong className="font-semibold">{invoice.invoiceNumber}</strong> (
        {formatCurrency(invoice.amountCents)}).
      </p>
      <p className="text-sm text-gray-500">
        This removes both the PDF and the payment record. This cannot be undone.
      </p>
      {error && (
        <div className="mt-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse a user-typed dollar string into integer cents. Accepts commas,
 * whitespace, and an optional leading `$`. Returns null for anything that
 * isn't a finite non-negative number so the caller can surface a validation
 * error rather than silently saving `$0.00`.
 *
 * Rounding: uses Math.round on (dollars * 100) to avoid FP drift
 * (`0.1 + 0.2 === 0.30000000000000004`). Post-round we still have an
 * integer number of cents.
 */
function parseDollarsToCents(input: string): number | null {
  const cleaned = input.replace(/[\s,$]/g, '');
  if (!cleaned) return null;
  const dollars = Number.parseFloat(cleaned);
  if (!Number.isFinite(dollars) || dollars < 0) return null;
  return Math.round(dollars * 100);
}

/** Full-precision currency string — used for the "Will save as..." preview. */
function formatCentsExact(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}
