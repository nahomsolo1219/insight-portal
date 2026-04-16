'use client';

import { Plus, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { createClient } from './actions';
import type { PmOption, TierOption } from './queries';

interface NewClientButtonProps {
  tiers: TierOption[];
  pms: PmOption[];
}

interface FormState {
  name: string;
  email: string;
  phone: string;
  membershipTierId: string;
  assignedPmId: string;
}

const emptyForm: FormState = {
  name: '',
  email: '',
  phone: '',
  membershipTierId: '',
  assignedPmId: '',
};

export function NewClientButton({ tiers, pms }: NewClientButtonProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const router = useRouter();

  function closeModal() {
    if (isPending) return;
    setOpen(false);
    setForm(emptyForm);
    setError(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createClient({
        name: form.name,
        email: form.email || undefined,
        phone: form.phone || undefined,
        membershipTierId: form.membershipTierId || undefined,
        assignedPmId: form.assignedPmId || undefined,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      setOpen(false);
      setForm(emptyForm);
      if (result.data?.id) {
        router.push(`/admin/clients/${result.data.id}`);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="bg-brand-gold-400 hover:bg-brand-gold-500 shadow-soft inline-flex items-center gap-2 rounded-xl px-5 py-2.5 font-medium text-white transition-all duration-150"
      >
        <Plus size={16} strokeWidth={2} />
        New Client
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          onClick={closeModal}
        >
          <div
            className="shadow-modal flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-8 py-6">
              <h2 className="text-xl font-semibold text-gray-900">New Client</h2>
              <button
                type="button"
                onClick={closeModal}
                disabled={isPending}
                aria-label="Close"
                className="rounded-lg p-2 text-gray-400 transition-all hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50"
              >
                <X size={18} strokeWidth={1.5} />
              </button>
            </div>

            <form
              onSubmit={handleSubmit}
              className="flex-1 space-y-5 overflow-y-auto px-8 py-6"
              id="new-client-form"
            >
              <Field label="Client name" required>
                <input
                  type="text"
                  required
                  autoFocus
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="The Andersons"
                  className="focus:ring-brand-teal-200 focus:border-brand-teal-400 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm transition-all outline-none focus:ring-2"
                />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Email">
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="client@example.com"
                    className="focus:ring-brand-teal-200 focus:border-brand-teal-400 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm transition-all outline-none focus:ring-2"
                  />
                </Field>
                <Field label="Phone">
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="(415) 555-0100"
                    className="focus:ring-brand-teal-200 focus:border-brand-teal-400 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm transition-all outline-none focus:ring-2"
                  />
                </Field>
              </div>
              <Field label="Membership tier">
                <select
                  value={form.membershipTierId}
                  onChange={(e) => setForm({ ...form, membershipTierId: e.target.value })}
                  className="focus:ring-brand-teal-200 focus:border-brand-teal-400 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm transition-all outline-none focus:ring-2"
                >
                  <option value="">— Select a tier —</option>
                  {tiers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Assigned Project Manager">
                <select
                  value={form.assignedPmId}
                  onChange={(e) => setForm({ ...form, assignedPmId: e.target.value })}
                  className="focus:ring-brand-teal-200 focus:border-brand-teal-400 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm transition-all outline-none focus:ring-2"
                >
                  <option value="">— Unassigned —</option>
                  {pms.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </Field>
              {error && (
                <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
                  {error}
                </div>
              )}
            </form>

            <div className="bg-brand-warm-50 flex justify-end gap-3 border-t border-gray-100 px-8 py-5">
              <button
                type="button"
                onClick={closeModal}
                disabled={isPending}
                className="rounded-xl px-5 py-2.5 font-medium text-gray-700 transition-all hover:bg-gray-100 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="new-client-form"
                disabled={isPending || !form.name.trim()}
                className="bg-brand-gold-400 hover:bg-brand-gold-500 shadow-soft rounded-xl px-5 py-2.5 font-medium text-white transition-all disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isPending ? 'Creating...' : 'Create client'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Field({
  label,
  children,
  required,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <div>
      <label className="mb-2 block text-xs font-semibold tracking-wider text-gray-500 uppercase">
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}
