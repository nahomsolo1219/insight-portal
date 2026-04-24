'use client';

import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Field, inputClass } from '@/components/admin/Field';
import { LoadingDots } from '@/components/admin/LoadingDots';
import { Modal } from '@/components/admin/Modal';
import { useToast } from '@/components/admin/ToastProvider';
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
  const { showToast } = useToast();

  function closeModal() {
    setOpen(false);
    setForm(emptyForm);
    setError(null);
  }

  function submit() {
    setError(null);
    if (!form.name.trim()) {
      setError('Client name is required.');
      return;
    }
    // Email is required — clients need it to reach the portal. Server also
    // enforces this; validating here gives an immediate inline error.
    if (!form.email.trim()) {
      setError('Email is required — clients need it for portal access.');
      return;
    }
    startTransition(async () => {
      const result = await createClient({
        name: form.name,
        email: form.email,
        phone: form.phone || undefined,
        membershipTierId: form.membershipTierId || undefined,
        assignedPmId: form.assignedPmId || undefined,
      });
      if (!result.success) {
        setError(result.error);
        showToast(result.error, 'error');
        return;
      }
      showToast('Client created');
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

      <Modal
        open={open}
        onClose={closeModal}
        title="New Client"
        locked={isPending}
        footer={
          <>
            <button
              type="button"
              onClick={closeModal}
              disabled={isPending}
              className="rounded-xl px-5 py-2.5 font-medium text-gray-700 transition-all hover:bg-gray-100 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={isPending || !form.name.trim() || !form.email.trim()}
              className="bg-brand-gold-400 hover:bg-brand-gold-500 shadow-soft rounded-xl px-5 py-2.5 font-medium text-white transition-all disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending ? (
                <>
                  Creating
                  <LoadingDots />
                </>
              ) : (
                'Create client'
              )}
            </button>
          </>
        }
      >
        <div className="space-y-5">
          <Field label="Client name" required>
            <input
              type="text"
              required
              autoFocus
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="The Andersons"
              className={inputClass}
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Email" required hint="Used for portal invites.">
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="client@example.com"
                className={inputClass}
              />
            </Field>
            <Field label="Phone">
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="(415) 555-0100"
                className={inputClass}
              />
            </Field>
          </div>
          <Field label="Membership tier">
            <select
              value={form.membershipTierId}
              onChange={(e) => setForm({ ...form, membershipTierId: e.target.value })}
              className={inputClass}
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
              className={inputClass}
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
        </div>
      </Modal>
    </>
  );
}
