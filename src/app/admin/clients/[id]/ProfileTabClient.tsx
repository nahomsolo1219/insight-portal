'use client';

import { AlertTriangle, Pencil } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Field, inputClass, textareaClass } from '@/components/admin/Field';
import { Modal } from '@/components/admin/Modal';
import { cn, formatDate } from '@/lib/utils';
import { archiveClient } from '../actions';
import { updateClient, updateProperty } from './actions';
import type { ProfileTabPm, ProfileTabTier } from './ProfileTab';
import type { ClientDetailRow, PropertyRow } from './queries';

// All three modals below use the same outer shape:
//   <TheModal open={open} onClose={onClose} ... />
// where the outer component gates on `open` and mounts the inner component
// fresh each time. That lets the inner component's useState initialise from
// the latest props without needing a useEffect reset dance.

interface ProfileTabClientProps {
  client: ClientDetailRow;
  property: PropertyRow | null;
  tiers: ProfileTabTier[];
  pms: ProfileTabPm[];
}

export function ProfileTabClient({ client, property, tiers, pms }: ProfileTabClientProps) {
  const [editClientOpen, setEditClientOpen] = useState(false);
  const [editPropertyOpen, setEditPropertyOpen] = useState(false);
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false);

  return (
    <div className="space-y-5">
      {/* Client info card */}
      <div className="shadow-card rounded-2xl bg-white p-6">
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

      {/* Property info card */}
      {property ? (
        <div className="shadow-card rounded-2xl bg-white p-6">
          <div className="mb-5 flex items-start justify-between">
            <h3 className="text-base font-semibold text-gray-900">Property Details</h3>
            <button
              type="button"
              onClick={() => setEditPropertyOpen(true)}
              className="text-brand-teal-500 hover:text-brand-teal-600 hover:bg-brand-teal-50 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all"
            >
              <Pencil size={14} strokeWidth={1.5} />
              Edit
            </button>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-4">
            <InfoRow label="Property name" value={property.name} />
            <InfoRow label="Address" value={formatFullAddress(property)} />
            <InfoRow
              label="Square footage"
              value={property.sqft != null ? property.sqft.toLocaleString() : null}
            />
            <InfoRow
              label="Year built"
              value={property.yearBuilt != null ? property.yearBuilt.toString() : null}
            />
            <InfoRow label="Gate code" value={property.gateCode} mono />
            <InfoRow label="Emergency contact" value={property.emergencyContact} />
            <div className="col-span-2">
              <InfoRow label="Access notes" value={property.accessNotes} multiline />
            </div>
          </div>
        </div>
      ) : (
        <div className="shadow-card rounded-2xl bg-white p-6 text-center text-sm text-gray-400">
          No property selected
        </div>
      )}

      {/* Danger zone — archiving is irreversible-ish, so it sits alone. */}
      {client.status === 'active' && (
        <div className="shadow-card rounded-2xl border-l-4 border-red-400 bg-white p-6">
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
      {editPropertyOpen && property && (
        <EditPropertyModal
          onClose={() => setEditPropertyOpen(false)}
          property={property}
          clientId={client.id}
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

function formatFullAddress(p: PropertyRow): string | null {
  const cityState = [p.city, p.state].filter(Boolean).join(', ');
  const parts = [p.address, cityState, p.zipcode].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : null;
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
        return;
      }
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
            className="rounded-xl px-5 py-2.5 font-medium text-gray-700 transition-all hover:bg-gray-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={isPending || !form.name.trim()}
            className="bg-brand-gold-400 hover:bg-brand-gold-500 shadow-soft rounded-xl px-5 py-2.5 font-medium text-white transition-all disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? 'Saving...' : 'Save changes'}
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
// Edit Property modal
// ---------------------------------------------------------------------------

interface EditPropertyModalProps {
  onClose: () => void;
  property: PropertyRow;
  clientId: string;
}

function EditPropertyModal({ onClose, property, clientId }: EditPropertyModalProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(() => ({
    name: property.name,
    address: property.address,
    city: property.city ?? '',
    state: property.state ?? '',
    zipcode: property.zipcode ?? '',
    sqft: property.sqft != null ? property.sqft.toString() : '',
    yearBuilt: property.yearBuilt != null ? property.yearBuilt.toString() : '',
    gateCode: property.gateCode ?? '',
    accessNotes: property.accessNotes ?? '',
    emergencyContact: property.emergencyContact ?? '',
  }));

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await updateProperty(property.id, clientId, {
        name: form.name,
        address: form.address,
        city: form.city,
        state: form.state,
        zipcode: form.zipcode || null,
        sqft: form.sqft ? parseInt(form.sqft, 10) : null,
        yearBuilt: form.yearBuilt ? parseInt(form.yearBuilt, 10) : null,
        gateCode: form.gateCode || null,
        accessNotes: form.accessNotes || null,
        emergencyContact: form.emergencyContact || null,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      onClose();
      router.refresh();
    });
  }

  const canSave =
    !!form.name.trim() && !!form.address.trim() && !!form.city.trim() && !!form.state.trim();

  return (
    <Modal
      open
      onClose={onClose}
      title="Edit property"
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
            disabled={isPending || !canSave}
            className="bg-brand-gold-400 hover:bg-brand-gold-500 shadow-soft rounded-xl px-5 py-2.5 font-medium text-white transition-all disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? 'Saving...' : 'Save changes'}
          </button>
        </>
      }
    >
      <div className="space-y-5">
        <Field label="Property name" required>
          <input
            type="text"
            required
            autoFocus
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className={inputClass}
          />
        </Field>
        <Field label="Street address" required>
          <input
            type="text"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            className={inputClass}
          />
        </Field>
        <div className="grid grid-cols-[2fr_1fr_1fr] gap-4">
          <Field label="City" required>
            <input
              type="text"
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
              className={inputClass}
            />
          </Field>
          <Field label="State" required>
            <input
              type="text"
              value={form.state}
              onChange={(e) => setForm({ ...form, state: e.target.value.toUpperCase() })}
              className={inputClass}
              maxLength={2}
            />
          </Field>
          <Field label="Zip code">
            <input
              type="text"
              value={form.zipcode}
              onChange={(e) => setForm({ ...form, zipcode: e.target.value })}
              className={inputClass}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Square footage">
            <input
              type="number"
              min={0}
              value={form.sqft}
              onChange={(e) => setForm({ ...form, sqft: e.target.value })}
              className={inputClass}
            />
          </Field>
          <Field label="Year built">
            <input
              type="number"
              min={1700}
              max={new Date().getFullYear() + 1}
              value={form.yearBuilt}
              onChange={(e) => setForm({ ...form, yearBuilt: e.target.value })}
              className={inputClass}
            />
          </Field>
        </div>
        <Field label="Gate code">
          <input
            type="text"
            value={form.gateCode}
            onChange={(e) => setForm({ ...form, gateCode: e.target.value })}
            className={inputClass}
          />
        </Field>
        <Field label="Emergency contact">
          <input
            type="text"
            value={form.emergencyContact}
            onChange={(e) => setForm({ ...form, emergencyContact: e.target.value })}
            placeholder="Name — phone"
            className={inputClass}
          />
        </Field>
        <Field label="Access notes" hint="Parking, pets, entry instructions, etc.">
          <textarea
            value={form.accessNotes}
            onChange={(e) => setForm({ ...form, accessNotes: e.target.value })}
            rows={3}
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
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await archiveClient(clientId);
      if (!result.success) {
        setError(result.error);
        return;
      }
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
            {isPending ? 'Archiving...' : 'Archive'}
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
