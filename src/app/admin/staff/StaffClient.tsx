'use client';

import { Mail, Pencil, Phone, Plus, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Field, inputClass } from '@/components/admin/Field';
import { LoadingDots } from '@/components/admin/LoadingDots';
import { Modal } from '@/components/admin/Modal';
import { useToast } from '@/components/admin/ToastProvider';
import { cn, initialsFrom } from '@/lib/utils';
import { createStaffMember, updateStaffMember } from './actions';
import type { StaffRole, StaffRow, StaffStatus } from './queries';

const ROLE_OPTIONS: { id: StaffRole; label: string; badge: string }[] = [
  { id: 'founder', label: 'Founder', badge: 'bg-brand-gold-50 text-brand-gold-600' },
  {
    id: 'project_manager',
    label: 'Project Manager',
    badge: 'bg-brand-teal-50 text-brand-teal-500',
  },
  { id: 'field_staff', label: 'Field Staff', badge: 'bg-blue-50 text-blue-700' },
  { id: 'admin_assistant', label: 'Admin Assistant', badge: 'bg-gray-100 text-gray-600' },
];

const STATUS_OPTIONS: { id: StaffStatus; label: string; badge: string }[] = [
  { id: 'active', label: 'Active', badge: 'bg-emerald-50 text-emerald-700' },
  { id: 'pending', label: 'Pending', badge: 'bg-amber-50 text-amber-700' },
  { id: 'inactive', label: 'Inactive', badge: 'bg-gray-100 text-gray-500' },
];

function roleMeta(role: string) {
  return ROLE_OPTIONS.find((r) => r.id === role) ?? ROLE_OPTIONS[4];
}

function statusMeta(status: string) {
  return STATUS_OPTIONS.find((s) => s.id === status) ?? STATUS_OPTIONS[0];
}

interface StaffClientProps {
  members: StaffRow[];
}

export function StaffClient({ members }: StaffClientProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<StaffRow | null>(null);

  return (
    <div>
      <div className="mb-5 flex items-center justify-end">
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="bg-brand-gold-400 hover:bg-brand-gold-500 shadow-soft inline-flex items-center gap-2 rounded-xl px-5 py-2.5 font-medium text-white transition-all duration-150"
        >
          <Plus size={16} strokeWidth={2} />
          Add staff
        </button>
      </div>

      {members.length === 0 ? (
        <EmptyState onCreate={() => setCreateOpen(true)} />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {members.map((m) => (
            <StaffCard key={m.id} member={m} onEdit={() => setEditTarget(m)} />
          ))}
        </div>
      )}

      {createOpen && <CreateStaffModal onClose={() => setCreateOpen(false)} />}
      {editTarget && <EditStaffModal member={editTarget} onClose={() => setEditTarget(null)} />}
    </div>
  );
}

// ---------- card ----------

function StaffCard({ member, onEdit }: { member: StaffRow; onEdit: () => void }) {
  const role = roleMeta(member.role);
  const status = statusMeta(member.status);
  const isInactive = member.status === 'inactive';

  return (
    <div
      className={cn(
        'shadow-soft-md rounded-2xl bg-paper p-5 transition-all',
        isInactive && 'opacity-70',
      )}
    >
      <div className="flex items-start gap-4">
        <div className="bg-brand-teal-500 flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white">
          {initialsFrom(member.name)}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-gray-900">{member.name}</div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <span
                  className={cn(
                    'inline-flex rounded-md px-2 py-0.5 text-[11px] font-medium',
                    role.badge,
                  )}
                >
                  {role.label}
                </span>
                <span
                  className={cn(
                    'inline-flex rounded-md px-2 py-0.5 text-[11px] font-medium',
                    status.badge,
                  )}
                >
                  {status.label}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={onEdit}
              aria-label={`Edit ${member.name}`}
              className="hover:text-brand-teal-500 rounded-lg p-1.5 text-gray-400 transition-all hover:bg-brand-warm-50"
            >
              <Pencil size={14} strokeWidth={1.5} />
            </button>
          </div>

          <div className="mt-3 space-y-1 text-xs text-gray-500">
            <a
              href={`mailto:${member.email}`}
              className="hover:text-brand-teal-500 inline-flex items-center gap-1.5 truncate transition-colors"
            >
              <Mail size={12} strokeWidth={1.5} className="text-gray-400" />
              {member.email}
            </a>
            {member.phone && (
              <a
                href={`tel:${member.phone}`}
                className="hover:text-brand-teal-500 flex items-center gap-1.5 transition-colors"
              >
                <Phone size={12} strokeWidth={1.5} className="text-gray-400" />
                {member.phone}
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- empty state ----------

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="shadow-soft-md rounded-2xl bg-paper p-12 text-center">
      <div className="bg-brand-warm-200 mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full text-gray-400">
        <Users size={24} strokeWidth={1.5} />
      </div>
      <h3 className="text-base font-semibold text-gray-900">No team members yet</h3>
      <p className="mx-auto mt-2 max-w-sm text-sm text-gray-500">
        Add staff to assign them to projects and appointments.
      </p>
      <button
        type="button"
        onClick={onCreate}
        className="bg-brand-gold-400 hover:bg-brand-gold-500 shadow-soft mt-5 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 font-medium text-white transition-all"
      >
        <Plus size={16} />
        Add staff
      </button>
    </div>
  );
}

// ---------- create modal ----------

function CreateStaffModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<StaffRole>('project_manager');
  const [phone, setPhone] = useState('');
  const [sendInvite, setSendInvite] = useState(false);

  function submit() {
    setError(null);
    setNotice(null);
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }
    if (!email.trim()) {
      setError('Email is required.');
      return;
    }

    startTransition(async () => {
      const result = await createStaffMember({
        name: name.trim(),
        role,
        email: email.trim(),
        phone: phone.trim() || null,
        sendInvite,
      });

      if (!result.success) {
        setError(result.error);
        showToast(result.error, 'error');
        return;
      }

      // If we tried to send an invite and it failed, leave the modal open
      // so the user sees why — the staff row already exists, so closing
      // and showing an empty refresh would be confusing.
      if (sendInvite && result.data && !result.data.inviteSent) {
        const noticeMsg = `Staff member created, but the invite email failed${
          result.data.inviteError ? ` (${result.data.inviteError})` : ''
        }. Resend from the edit modal later.`;
        setNotice(noticeMsg);
        showToast('Invite email failed — see modal for details', 'error');
        router.refresh();
        return;
      }

      showToast(sendInvite ? 'Staff member added and invited' : 'Staff member added');
      onClose();
      router.refresh();
    });
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Add staff"
      size="md"
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
            className="bg-brand-gold-500 hover:bg-brand-gold-600 text-paper rounded-lg px-4 py-2.5 font-medium transition disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? (
              <>
                Adding
                <LoadingDots />
              </>
            ) : (
              'Add staff'
            )}
          </button>
        </>
      }
    >
      <div className="space-y-5">
        <Field label="Name" required>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Sarah Chen"
            className={inputClass}
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Email" required>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="sarah@insighthm.com"
              className={inputClass}
            />
          </Field>
          <Field label="Phone">
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(415) 555-0100"
              className={inputClass}
            />
          </Field>
        </div>

        <Field label="Role" required>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as StaffRole)}
            className={inputClass}
          >
            {ROLE_OPTIONS.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </Field>

        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line px-4 py-3 transition-colors hover:bg-brand-warm-50">
          <input
            type="checkbox"
            checked={sendInvite}
            onChange={(e) => setSendInvite(e.target.checked)}
            className="text-brand-teal-500 focus:ring-brand-teal-200 mt-0.5 h-4 w-4 rounded border-gray-300"
          />
          <div>
            <div className="text-sm font-medium text-gray-900">Send portal invite email</div>
            <p className="mt-0.5 text-xs text-gray-500">
              Emails a magic-link invite via Supabase. The member shows as &ldquo;Pending&rdquo;
              until they accept.
            </p>
          </div>
        </label>

        {error && (
          <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}
        {notice && (
          <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {notice}
          </div>
        )}
      </div>
    </Modal>
  );
}

// ---------- edit modal ----------

function EditStaffModal({ member, onClose }: { member: StaffRow; onClose: () => void }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(member.name);
  const [email, setEmail] = useState(member.email);
  const [role, setRole] = useState<StaffRole>(member.role);
  const [phone, setPhone] = useState(member.phone ?? '');
  const [status, setStatus] = useState<StaffStatus>(member.status);

  function submit() {
    setError(null);
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }
    if (!email.trim()) {
      setError('Email is required.');
      return;
    }

    startTransition(async () => {
      const result = await updateStaffMember(member.id, {
        name: name.trim(),
        email: email.trim(),
        role,
        phone: phone.trim() || null,
        status,
      });

      if (!result.success) {
        setError(result.error);
        showToast(result.error, 'error');
        return;
      }
      showToast('Staff member updated');
      onClose();
      router.refresh();
    });
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Edit ${member.name}`}
      size="md"
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
        <Field label="Name" required>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Email" required>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Phone">
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Role" required>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as StaffRole)}
              className={inputClass}
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Status" required>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as StaffStatus)}
              className={inputClass}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {error && (
          <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}
