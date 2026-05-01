'use client';

import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Field, inputClass, textareaClass } from '@/components/admin/Field';
import { LoadingDots } from '@/components/admin/LoadingDots';
import { Modal } from '@/components/admin/Modal';
import { useToast } from '@/components/admin/ToastProvider';
import { cn } from '@/lib/utils';
import { createProperty } from './actions';

interface FormState {
  name: string;
  address: string;
  city: string;
  state: string;
  zipcode: string;
  sqft: string;
  yearBuilt: string;
  gateCode: string;
  emergencyContact: string;
  accessNotes: string;
}

const emptyForm: FormState = {
  name: '',
  address: '',
  city: '',
  state: '',
  zipcode: '',
  sqft: '',
  yearBuilt: '',
  gateCode: '',
  emergencyContact: '',
  accessNotes: '',
};

interface Props {
  clientId: string;
  /** Visual variant — `cta` is the prominent gold-button card we show on a
   *  zero-property client; `inline` is the compact text-button for the
   *  property switcher / Profile tab. */
  variant?: 'cta' | 'inline' | 'subtle';
}

/**
 * Add Property button + modal. The actual `<button>` rendering is variant-
 * dependent so this one component drops cleanly into three contexts:
 * - First-property empty state (cta): full empty-state card with copy.
 * - Property switcher (inline): compact "+ Add Property" pill.
 * - Profile tab (subtle): a small dashed-border "Add another property"
 *   link card sitting under existing property details.
 */
export function AddPropertyButton({ clientId, variant = 'inline' }: Props) {
  const router = useRouter();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  function close() {
    setOpen(false);
    setForm(emptyForm);
    setError(null);
  }

  function submit() {
    setError(null);
    if (!form.name.trim()) return setError('Property name is required.');
    if (!form.address.trim()) return setError('Street address is required.');
    if (!form.city.trim()) return setError('City is required.');
    if (!form.state.trim()) return setError('State is required.');

    const sqftNum = form.sqft.trim() ? Number(form.sqft) : null;
    const yearNum = form.yearBuilt.trim() ? Number(form.yearBuilt) : null;
    if (sqftNum !== null && (!Number.isFinite(sqftNum) || sqftNum < 0)) {
      return setError('Square footage must be a positive number.');
    }
    if (yearNum !== null && (!Number.isFinite(yearNum) || yearNum < 1800 || yearNum > 2100)) {
      return setError('Year built must be a real year.');
    }

    startTransition(async () => {
      const result = await createProperty(clientId, {
        name: form.name,
        address: form.address,
        city: form.city,
        state: form.state,
        zipcode: form.zipcode || undefined,
        sqft: sqftNum,
        yearBuilt: yearNum,
        gateCode: form.gateCode || undefined,
        emergencyContact: form.emergencyContact || undefined,
        accessNotes: form.accessNotes || undefined,
      });

      if (!result.success) {
        setError(result.error);
        showToast(result.error, 'error');
        return;
      }

      showToast('Property added');
      close();
      // Navigate to the new property so subsequent tabs (Projects,
      // Documents, etc.) immediately scope to it.
      if (result.data?.id) {
        router.push(`/admin/clients/${clientId}?property=${result.data.id}`);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <>
      <Trigger variant={variant} onClick={() => setOpen(true)} />
      <Modal
        open={open}
        onClose={close}
        title="Add property"
        size="lg"
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
                'Add property'
              )}
            </button>
          </>
        }
      >
        <div className="space-y-5">
          <Field label="Property name" required>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Larkin St Residence"
              autoFocus
              className={inputClass}
            />
          </Field>

          <Field label="Street address" required>
            <input
              type="text"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              placeholder="2410 Larkin Street"
              className={inputClass}
            />
          </Field>

          <div className="grid grid-cols-[2fr_1fr_1fr] gap-3">
            <Field label="City" required>
              <input
                type="text"
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                placeholder="San Francisco"
                className={inputClass}
              />
            </Field>
            <Field label="State" required hint="2 letters">
              <input
                type="text"
                value={form.state}
                onChange={(e) =>
                  setForm({ ...form, state: e.target.value.slice(0, 2).toUpperCase() })
                }
                placeholder="CA"
                maxLength={2}
                className={inputClass}
              />
            </Field>
            <Field label="Zip">
              <input
                type="text"
                value={form.zipcode}
                onChange={(e) => setForm({ ...form, zipcode: e.target.value })}
                placeholder="94109"
                className={inputClass}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Square footage" hint="Optional">
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={form.sqft}
                onChange={(e) => setForm({ ...form, sqft: e.target.value })}
                placeholder="3,200"
                className={inputClass}
              />
            </Field>
            <Field label="Year built" hint="Optional">
              <input
                type="number"
                inputMode="numeric"
                min={1800}
                max={2100}
                value={form.yearBuilt}
                onChange={(e) => setForm({ ...form, yearBuilt: e.target.value })}
                placeholder="1908"
                className={inputClass}
              />
            </Field>
          </div>

          <Field label="Gate code" hint="Optional. For gated communities or shared driveways.">
            <input
              type="text"
              value={form.gateCode}
              onChange={(e) => setForm({ ...form, gateCode: e.target.value })}
              placeholder="0413#"
              className={inputClass}
            />
          </Field>

          <Field label="Emergency contact" hint="Name + phone for urgent issues.">
            <input
              type="text"
              value={form.emergencyContact}
              onChange={(e) => setForm({ ...form, emergencyContact: e.target.value })}
              placeholder="Mr Anderson · (415) 555-0100"
              className={inputClass}
            />
          </Field>

          <Field
            label="Access notes"
            hint="Anything the field team needs to know on arrival."
          >
            <textarea
              value={form.accessNotes}
              onChange={(e) => setForm({ ...form, accessNotes: e.target.value })}
              rows={3}
              placeholder="Side gate entry preferred. Dog in backyard (friendly)."
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

// ---------------------------------------------------------------------------
// Variants
// ---------------------------------------------------------------------------

function Trigger({ variant, onClick }: { variant: Props['variant']; onClick: () => void }) {
  if (variant === 'cta') {
    // First-property empty state. Big card with copy + gold CTA so a freshly
    // created client lands somewhere actionable instead of "no properties".
    return (
      <div className="shadow-soft-md rounded-2xl bg-paper p-12 text-center">
        <div className="bg-brand-warm-200 mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full text-gray-400">
          <Plus size={24} strokeWidth={1.5} />
        </div>
        <h3 className="text-base font-semibold text-gray-900">Add your first property</h3>
        <p className="mx-auto mt-2 max-w-sm text-sm text-gray-500">
          Start by adding the client&apos;s home. Once a property is on file you&apos;ll be able
          to create projects, schedule visits, and track invoices.
        </p>
        <button
          type="button"
          onClick={onClick}
          className="bg-brand-gold-400 hover:bg-brand-gold-500 shadow-soft mt-5 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 font-medium text-white transition-all"
        >
          <Plus size={16} strokeWidth={2} />
          Add property
        </button>
      </div>
    );
  }

  if (variant === 'subtle') {
    // Profile-tab dashed-border card so it sits below existing property
    // details without competing with the Edit / Archive actions there.
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-line px-4 py-3 text-sm font-medium text-gray-500 transition-all',
          'hover:border-brand-teal-300 hover:text-brand-teal-500 hover:bg-brand-warm-50',
        )}
      >
        <Plus size={14} strokeWidth={1.75} />
        Add another property
      </button>
    );
  }

  // inline (default) — compact pill that fits next to the property switcher.
  return (
    <button
      type="button"
      onClick={onClick}
      className="hover:text-brand-teal-500 hover:bg-brand-warm-50 inline-flex items-center gap-1 rounded-xl border border-dashed border-line px-3 py-2 text-sm font-medium text-gray-500 transition-all"
    >
      <Plus size={14} strokeWidth={1.75} />
      Add property
    </button>
  );
}
