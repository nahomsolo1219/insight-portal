'use client';

import { AlertTriangle, Pencil } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Field, inputClass } from '@/components/admin/Field';
import { LoadingDots } from '@/components/admin/LoadingDots';
import { Modal } from '@/components/admin/Modal';
import { useToast } from '@/components/admin/ToastProvider';
import { cn, formatDate } from '@/lib/utils';
import { archiveClient } from '../actions';
import { updateClient } from './actions';
import type { ProfileTabPm, ProfileTabTier } from './ProfileTab';
import type { ClientDetailRow } from './queries';

// Property concerns moved to the dedicated Properties tab — Profile is
// now strictly client-info + the archive danger zone. The two modals
// below (edit client, archive confirm) use the same gated-mount pattern
// so their inner state always initialises from the latest props.

interface ProfileTabClientProps {
  client: ClientDetailRow;
  tiers: ProfileTabTier[];
  pms: ProfileTabPm[];
}

export function ProfileTabClient({ client, tiers, pms }: ProfileTabClientProps) {
  const [editClientOpen, setEditClientOpen] = useState(false);
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false);

  return (
    <div className="space-y-5">
      {/* Client info card */}
      <div className="shadow-soft-md rounded-2xl bg-paper p-6">
        <div className="mb-5 flex items-start justify-between">
          <h3 className="text-base font-semibold text-gray-900">Client Information</h3>
          <button
            type="button"
            onClick={() => setEditClientOpen(true)}
            className="text-brand-teal-500 hover:text-brand-teal-600 hover:bg-brand-teal-50 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all"
          >
            <Pencil size={14} strokeWidth={1.5} />
            Edit
          </button>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-4">
          <InfoRow label="Name" value={client.name} />
          <InfoRow label="Status" value={client.status} capitalize />
          <InfoRow label="Email" value={client.email} />
          <InfoRow label="Phone" value={client.phone} />
          <InfoRow label="Membership tier" value={client.tierName} />
          <InfoRow label="Assigned PM" value={client.assignedPmName} />
          <InfoRow
            label="Member since"
            value={client.memberSince ? formatDate(client.memberSince) : null}
          />
        </div>
      </div>

      {/* Property management lives in the dedicated Properties tab. Anything
          you'd want to do to a property — add, edit, delete, see projects
          per property — is one tab away. */}

      {/* Danger zone — archiving is irreversible-ish, so it sits alone. */}
      {client.status === 'active' && (
        <div className="shadow-soft-md rounded-2xl border-l-4 border-red-400 bg-paper p-6">
          <h3 className="mb-1 text-base font-semibold text-gray-900">Archive client</h3>
          <p className="mb-4 text-sm text-gray-500">
            Archiving marks this client as inactive. Historical data stays intact. You can restore
            later.
          </p>
          <button
            type="button"
            onClick={() => setArchiveConfirmOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-red-600 transition-all hover:bg-red-50 hover:text-red-700"
          >
            <AlertTriangle size={14} strokeWidth={1.5} />
            Archive this client
          </button>
        </div>
      )}

      {/* Outer gates ensure the inner modal + its state only exist while open. */}
      {editClientOpen && (
        <EditClientModal
          onClose={() => setEditClientOpen(false)}
          client={client}
          tiers={tiers}
          pms={pms}
        />
      )}
      {archiveConfirmOpen && (
        <ArchiveConfirmModal
          onClose={() => setArchiveConfirmOpen(false)}
          clientId={client.id}
          clientName={client.name}
        />
      )}
    </div>
  );
}

interface InfoRowProps {
  label: string;
  value: string | null;
  mono?: boolean;
  capitalize?: boolean;
  multiline?: boolean;
}

function InfoRow({ label, value, mono, capitalize, multiline }: InfoRowProps) {
  return (
    <div>
      <div className="text-[10px] font-medium tracking-wider text-gray-400 uppercase">{label}</div>
      <div
        className={cn(
          'mt-1 text-sm',
          value ? 'text-gray-900' : 'text-gray-400',
          mono && 'font-mono',
          capitalize && 'capitalize',
          multiline ? 'whitespace-pre-wrap' : 'truncate',
        )}
      >
        {value || '—'}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edit Client modal
// ---------------------------------------------------------------------------

interface EditClientModalProps {
  onClose: () => void;
  client: ClientDetailRow;
  tiers: ProfileTabTier[];
  pms: ProfileTabPm[];
}

function EditClientModal({ onClose, client, tiers, pms }: EditClientModalProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(() => ({
    name: client.name,
    email: client.email ?? '',
    phone: client.phone ?? '',
    membershipTierId: client.tierId ?? '',
    assignedPmId: client.assignedPmId ?? '',
    memberSince: client.memberSince ?? '',
  }));

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await updateClient(client.id, {
        name: form.name,
        email: form.email || null,
        phone: form.phone || null,
        membershipTierId: form.membershipTierId || null,
        assignedPmId: form.assignedPmId || null,
        memberSince: form.memberSince || null,
      });
      if (!result.success) {
        setError(result.error);
        showToast(result.error, 'error');
        return;
      }
      showToast('Client updated');
      onClose();
      router.refresh();
    });
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Edit client"
      locked={isPending}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="bg-paper border border-line text-ink-700 hover:bg-cream rounded-lg px-4 py-2.5 font-medium transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={isPending || !form.name.trim()}
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
        <Field label="Client name" required>
          <input
            type="text"
            required
            autoFocus
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className={inputClass}
          />
        </Field>
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
        <Field label="Membership tier">
          <select
            value={form.membershipTierId}
            onChange={(e) => setForm({ ...form, membershipTierId: e.target.value })}
            className={inputClass}
          >
            <option value="">— None —</option>
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
        <Field label="Member since" hint="Date when the client signed on">
          <input
            type="date"
            value={form.memberSince}
            onChange={(e) => setForm({ ...form, memberSince: e.target.value })}
            className={inputClass}
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
// Archive confirmation
// ---------------------------------------------------------------------------

interface ArchiveConfirmModalProps {
  onClose: () => void;
  clientId: string;
  clientName: string;
}

function ArchiveConfirmModal({ onClose, clientId, clientName }: ArchiveConfirmModalProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await archiveClient(clientId);
      if (!result.success) {
        setError(result.error);
        showToast(result.error, 'error');
        return;
      }
      showToast(`Archived ${clientName}`);
      onClose();
      router.push('/admin/clients');
      router.refresh();
    });
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Archive client?"
      size="sm"
      locked={isPending}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="bg-paper border border-line text-ink-700 hover:bg-cream rounded-lg px-4 py-2.5 font-medium transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={isPending}
            className="bg-rose-600 hover:bg-rose-700 text-paper rounded-lg px-4 py-2.5 font-medium transition disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? (
              <>
                Archiving
                <LoadingDots />
              </>
            ) : (
              'Archive'
            )}
          </button>
        </>
      }
    >
      <p className="mb-3 text-sm text-gray-700">
        You&apos;re about to archive <strong className="font-semibold">{clientName}</strong>.
      </p>
      <p className="text-sm text-gray-500">
        The client will be marked inactive and hidden from default views. All their projects,
        photos, invoices, and history stay intact. You can restore this client later from the
        inactive filter on the Clients page.
      </p>
      {error && (
        <div className="mt-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}
    </Modal>
  );
}
