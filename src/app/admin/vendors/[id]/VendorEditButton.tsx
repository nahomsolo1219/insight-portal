'use client';

import { Pencil } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Field, inputClass, textareaClass } from '@/components/admin/Field';
import { LoadingDots } from '@/components/admin/LoadingDots';
import { Modal } from '@/components/admin/Modal';
import { useToast } from '@/components/admin/ToastProvider';
import { updateVendor } from '../actions';
import type { VendorDetailRow } from './queries';

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

interface FormState {
  name: string;
  category: string;
  phone: string;
  email: string;
  notes: string;
}

/**
 * Edit-vendor button + modal for the detail-page header. Mirrors the
 * shape of the create-vendor modal on the list page so vendor metadata
 * always edits with the same fields no matter where you launch it from.
 */
export function VendorEditButton({ vendor }: { vendor: VendorDetailRow }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({
    name: vendor.name,
    category: vendor.category,
    phone: vendor.phone ?? '',
    email: vendor.email ?? '',
    notes: vendor.notes ?? '',
  });

  function close() {
    setOpen(false);
    // Reset form back to props in case the user reopens after a cancel —
    // otherwise their abandoned edits would persist into the next open.
    setForm({
      name: vendor.name,
      category: vendor.category,
      phone: vendor.phone ?? '',
      email: vendor.email ?? '',
      notes: vendor.notes ?? '',
    });
    setError(null);
  }

  function submit() {
    setError(null);
    if (!form.name.trim()) return setError('Vendor name is required.');
    if (!form.category.trim()) return setError('Category is required.');

    startTransition(async () => {
      const result = await updateVendor(vendor.id, {
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
      showToast('Vendor updated');
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-brand-teal-500 hover:text-brand-teal-600 hover:bg-brand-teal-50 inline-flex flex-shrink-0 items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium transition-all"
      >
        <Pencil size={14} strokeWidth={1.5} />
        Edit
      </button>

      <Modal
        open={open}
        onClose={close}
        title="Edit vendor"
        locked={isPending}
        footer={
          <>
            <button
              type="button"
              onClick={close}
              disabled={isPending}
              className="bg-paper border border-line text-ink-700 hover:bg-cream rounded-lg px-4 py-2.5 font-medium transition disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={isPending}
              className="bg-brand-gold-500 hover:bg-brand-gold-600 text-paper rounded-lg px-4 py-2.5 font-medium transition disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending ? (
                <>
                  Saving
                  <LoadingDots />
                </>
              ) : (
                'Save changes'
              )}
            </button>
          </>
        }
      >
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Name" required>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className={inputClass}
              />
            </Field>
            <Field label="Category" required>
              <input
                type="text"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                list="vendor-categories"
                className={inputClass}
              />
              <datalist id="vendor-categories">
                {SUGGESTED_CATEGORIES.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Email">
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className={inputClass}
              />
            </Field>
            <Field label="Phone">
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className={inputClass}
              />
            </Field>
          </div>

          <Field label="Notes">
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={3}
              placeholder="Any internal notes about this vendor"
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
    </>
  );
}
