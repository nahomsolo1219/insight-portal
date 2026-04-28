'use client';

import { ChevronRight, Plus, Power, Search, Users } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { Field, inputClass, textareaClass } from '@/components/admin/Field';
import { Modal } from '@/components/admin/Modal';
import { useToast } from '@/components/admin/ToastProvider';
import { cn } from '@/lib/utils';
import { createVendor, toggleVendorActive } from './actions';
import type { VendorRow } from './queries';

/**
 * Suggested categories for the datalist in the create/edit modal. Typing
 * in something new is allowed — the input accepts any string, the
 * datalist is just an autocomplete hint.
 */
const SUGGESTED_CATEGORIES = [
  'HVAC',
  'Plumbing',
  'Electrical',
  'Painting',
  'Roofing',
  'Landscaping',
  'General Contractor',
  'Flooring',
  'Cabinetry',
  'Masonry',
  'Windows & Doors',
  'Appliances',
  'Security',
  'Pool & Spa',
  'Pest Control',
  'Other',
];

interface VendorsClientProps {
  vendors: VendorRow[];
}

export function VendorsClient({ vendors }: VendorsClientProps) {
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return vendors;
    return vendors.filter(
      (v) =>
        v.name.toLowerCase().includes(q) ||
        v.category.toLowerCase().includes(q) ||
        (v.email?.toLowerCase().includes(q) ?? false),
    );
  }, [vendors, search]);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[260px] flex-1">
          <Search
            size={14}
            strokeWidth={1.5}
            className="absolute top-1/2 left-3.5 -translate-y-1/2 text-gray-400"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, category, or email"
            className={cn(inputClass, 'pl-9')}
          />
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="bg-brand-gold-400 hover:bg-brand-gold-500 shadow-soft inline-flex flex-shrink-0 items-center gap-2 rounded-xl px-5 py-2.5 font-medium text-white transition-all duration-150"
        >
          <Plus size={16} strokeWidth={2} />
          Add vendor
        </button>
      </div>

      {vendors.length === 0 ? (
        <EmptyState onCreate={() => setCreateOpen(true)} />
      ) : filtered.length === 0 ? (
        <div className="shadow-soft-md rounded-2xl bg-paper p-12 text-center text-sm text-gray-400">
          No vendors match &ldquo;{search}&rdquo;.
        </div>
      ) : (
        <VendorTable vendors={filtered} />
      )}

      {createOpen && <CreateVendorModal onClose={() => setCreateOpen(false)} />}
    </div>
  );
}

// ---------- table ----------

function VendorTable({ vendors }: { vendors: VendorRow[] }) {
  return (
    <div className="shadow-soft-md overflow-hidden rounded-2xl bg-paper">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-line-2">
              <Th>Name</Th>
              <Th>Category</Th>
              <Th>Contact</Th>
              <Th align="right">Jobs</Th>
              <Th>Status</Th>
              <Th align="right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {vendors.map((v) => (
              <VendorTableRow key={v.id} vendor={v} />
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

function VendorTableRow({ vendor }: { vendor: VendorRow }) {
  // Wrap the name in a Link so it's the obvious tap target on a touch device
  // and exposes the URL on hover for desktop. The whole row navigates via the
  // chevron button at the end too — both lead to the same detail page.
  return (
    <tr
      className={cn(
        'hover:bg-brand-warm-50 border-b border-gray-50 transition-colors last:border-b-0',
        !vendor.active && 'text-gray-400',
      )}
    >
      <td className="px-4 py-4 text-sm font-medium">
        <Link
          href={`/admin/vendors/${vendor.id}`}
          className={cn(
            'hover:text-brand-teal-500 transition-colors',
            vendor.active ? 'text-gray-900' : 'text-gray-500',
          )}
        >
          {vendor.name}
        </Link>
      </td>
      <td className="px-4 py-4 text-sm">
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium',
            vendor.active
              ? 'bg-cream text-gray-600'
              : 'bg-gray-100 text-gray-400',
          )}
        >
          {vendor.category}
        </span>
      </td>
      <td className="px-4 py-4 text-sm">
        {vendor.email && <div className="truncate">{vendor.email}</div>}
        {vendor.phone && <div className="text-xs text-gray-500">{vendor.phone}</div>}
        {!vendor.email && !vendor.phone && <span className="text-xs text-gray-300">—</span>}
      </td>
      <td className="px-4 py-4 text-right text-sm tabular-nums">{vendor.jobsCompleted}</td>
      <td className="px-4 py-4">
        <span
          className={cn(
            'inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium',
            vendor.active ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500',
          )}
        >
          {vendor.active ? 'Active' : 'Inactive'}
        </span>
      </td>
      <td className="px-4 py-4">
        <div className="flex items-center justify-end gap-1">
          <ToggleActiveButton vendor={vendor} />
          <Link
            href={`/admin/vendors/${vendor.id}`}
            aria-label={`View ${vendor.name}`}
            className="hover:text-brand-teal-500 hover:bg-brand-warm-50 rounded-lg p-1.5 text-gray-400 transition-all"
          >
            <ChevronRight size={14} strokeWidth={1.75} />
          </Link>
        </div>
      </td>
    </tr>
  );
}

function ToggleActiveButton({ vendor }: { vendor: VendorRow }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();

  function flip() {
    startTransition(async () => {
      const result = await toggleVendorActive(vendor.id);
      if (!result.success) {
        showToast(result.error, 'error');
        return;
      }
      showToast(`${vendor.name} ${vendor.active ? 'deactivated' : 'activated'}`);
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={flip}
      disabled={isPending}
      aria-label={vendor.active ? `Deactivate ${vendor.name}` : `Activate ${vendor.name}`}
      title={vendor.active ? 'Deactivate' : 'Activate'}
      className={cn(
        'rounded-lg p-1.5 transition-all',
        vendor.active
          ? 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
          : 'hover:bg-emerald-50 text-emerald-600 hover:text-emerald-700',
        isPending && 'opacity-50',
      )}
    >
      <Power size={14} strokeWidth={1.5} />
    </button>
  );
}

// ---------- empty state ----------

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="shadow-soft-md rounded-2xl bg-paper p-12 text-center">
      <div className="bg-brand-warm-200 mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full text-gray-400">
        <Users size={24} strokeWidth={1.5} />
      </div>
      <h3 className="text-base font-semibold text-gray-900">No vendors yet</h3>
      <p className="mx-auto mt-2 max-w-sm text-sm text-gray-500">
        Add your first subcontractor to start dispatching work.
      </p>
      <button
        type="button"
        onClick={onCreate}
        className="bg-brand-gold-400 hover:bg-brand-gold-500 shadow-soft mt-5 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 font-medium text-white transition-all"
      >
        <Plus size={16} />
        Add vendor
      </button>
    </div>
  );
}

// ---------- modals ----------

interface VendorFormState {
  name: string;
  category: string;
  phone: string;
  email: string;
  notes: string;
}

function CreateVendorModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<VendorFormState>({
    name: '',
    category: '',
    phone: '',
    email: '',
    notes: '',
  });

  function submit() {
    setError(null);
    if (!form.name.trim()) {
      setError('Vendor name is required.');
      return;
    }
    if (!form.category.trim()) {
      setError('Category is required.');
      return;
    }
    startTransition(async () => {
      const result = await createVendor({
        name: form.name.trim(),
        category: form.category.trim(),
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        notes: form.notes.trim() || null,
      });
      if (!result.success) {
        setError(result.error);
        showToast(result.error, 'error');
        return;
      }
      showToast('Vendor added');
      onClose();
      router.refresh();
    });
  }

  return (
    <VendorFormModal
      title="Add vendor"
      form={form}
      setForm={setForm}
      error={error}
      isPending={isPending}
      onClose={onClose}
      onSubmit={submit}
      submitLabel="Add vendor"
      submittingLabel="Adding..."
    />
  );
}

// EditVendorModal moved to /admin/vendors/[id]/VendorEditButton.tsx — the
// edit flow now lives on the detail page so the row stays a pure
// navigation target.

interface VendorFormModalProps {
  title: string;
  form: VendorFormState;
  setForm: (updater: (prev: VendorFormState) => VendorFormState) => void;
  error: string | null;
  isPending: boolean;
  onClose: () => void;
  onSubmit: () => void;
  submitLabel: string;
  submittingLabel: string;
}

function VendorFormModal({
  title,
  form,
  setForm,
  error,
  isPending,
  onClose,
  onSubmit,
  submitLabel,
  submittingLabel,
}: VendorFormModalProps) {
  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      size="md"
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
            onClick={onSubmit}
            disabled={isPending}
            className="bg-brand-gold-400 hover:bg-brand-gold-500 shadow-soft rounded-xl px-5 py-2.5 font-medium text-white transition-all disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? submittingLabel : submitLabel}
          </button>
        </>
      }
    >
      <div className="space-y-5">
        <Field label="Name" required>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            placeholder="e.g. Bay Air HVAC"
            className={inputClass}
          />
        </Field>

        <Field label="Category" required hint="Pick a suggestion or type your own.">
          <input
            type="text"
            list="vendor-categories"
            value={form.category}
            onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
            placeholder="e.g. HVAC"
            className={inputClass}
          />
          <datalist id="vendor-categories">
            {SUGGESTED_CATEGORIES.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Phone">
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
              placeholder="(415) 555-0100"
              className={inputClass}
            />
          </Field>
          <Field label="Email">
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
              placeholder="dispatch@bayair.com"
              className={inputClass}
            />
          </Field>
        </div>

        <Field label="Notes" hint="Internal only — not shared with the client.">
          <textarea
            value={form.notes}
            onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
            rows={3}
            placeholder="Reliable, fast turnaround; prefers morning visits"
            className={textareaClass}
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

