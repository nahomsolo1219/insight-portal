'use client';

import {
  Building2,
  CreditCard,
  Mail,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { Field, inputClass, textareaClass } from '@/components/admin/Field';
import { Modal } from '@/components/admin/Modal';
import { useToast } from '@/components/admin/ToastProvider';
import { cn, formatCurrency } from '@/lib/utils';
import { createTier, deleteTier, updateEmailTemplate, updateTier } from './actions';
import type { EmailTemplateRow, MembershipTierRow } from './queries';

type SectionId = 'company' | 'tiers' | 'email';

const SECTIONS: { id: SectionId; label: string; icon: typeof Building2 }[] = [
  { id: 'company', label: 'Company', icon: Building2 },
  { id: 'tiers', label: 'Membership tiers', icon: CreditCard },
  { id: 'email', label: 'Email templates', icon: Mail },
];

interface SettingsClientProps {
  tiers: MembershipTierRow[];
  emailTemplates: EmailTemplateRow[];
}

export function SettingsClient({ tiers, emailTemplates }: SettingsClientProps) {
  const [active, setActive] = useState<SectionId>('company');

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-[220px_1fr]">
      {/* Vertical nav */}
      <nav className="shadow-card h-fit rounded-2xl bg-white p-2">
        {SECTIONS.map((s) => {
          const Icon = s.icon;
          const isActive = active === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setActive(s.id)}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-all',
                isActive
                  ? 'bg-brand-teal-50 text-brand-teal-500'
                  : 'hover:bg-brand-warm-50 text-gray-600',
              )}
            >
              <Icon size={14} strokeWidth={1.5} />
              {s.label}
            </button>
          );
        })}
      </nav>

      <div>
        {active === 'company' && <CompanySection />}
        {active === 'tiers' && <TiersSection tiers={tiers} />}
        {active === 'email' && <EmailTemplatesSection templates={emailTemplates} />}
      </div>
    </div>
  );
}

// ---------- Company (placeholder) ----------

function CompanySection() {
  return (
    <div className="shadow-card rounded-2xl bg-white p-6">
      <h2 className="text-lg font-semibold text-gray-900">Insight Home Maintenance</h2>
      <p className="mt-2 text-sm text-gray-500">
        Luxury home maintenance and remodel firm — SF Bay Area.
      </p>
      <div className="bg-brand-warm-50 mt-5 rounded-xl border border-gray-100 px-4 py-3 text-sm text-gray-500">
        Company profile editing (logo, contact info, branding) comes in a future update.
      </div>
    </div>
  );
}

// ---------- Tiers ----------

function TiersSection({ tiers }: { tiers: MembershipTierRow[] }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<MembershipTierRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MembershipTierRow | null>(null);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Membership tiers</h2>
          <p className="mt-1 text-sm text-gray-500">
            Annual plans clients subscribe to. Assigning a client to a tier is done on the client
            profile.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="bg-brand-gold-400 hover:bg-brand-gold-500 shadow-soft inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-white transition-all"
        >
          <Plus size={14} strokeWidth={2} />
          Add tier
        </button>
      </div>

      {tiers.length === 0 ? (
        <div className="shadow-card rounded-2xl bg-white p-12 text-center">
          <div className="bg-brand-warm-200 mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full text-gray-400">
            <CreditCard size={24} strokeWidth={1.5} />
          </div>
          <h3 className="text-base font-semibold text-gray-900">No membership tiers yet</h3>
          <p className="mx-auto mt-2 max-w-sm text-sm text-gray-500">
            Create tiers like &ldquo;Essential&rdquo; or &ldquo;Premier&rdquo; so clients can be
            categorised on the Profile tab.
          </p>
        </div>
      ) : (
        <div className="shadow-card overflow-hidden rounded-2xl bg-white">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <Th>Tier</Th>
                <Th align="right">Annual price</Th>
                <Th align="right">Clients</Th>
                <Th align="right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {tiers.map((t) => (
                <tr
                  key={t.id}
                  className="hover:bg-brand-warm-50 border-b border-gray-50 transition-colors last:border-b-0"
                >
                  <td className="px-4 py-4">
                    <div className="text-sm font-medium text-gray-900">{t.name}</div>
                    {t.description && (
                      <div className="mt-0.5 truncate text-xs text-gray-500">{t.description}</div>
                    )}
                  </td>
                  <td className="px-4 py-4 text-right text-sm font-medium tabular-nums text-gray-900">
                    {formatCurrency(t.annualPriceCents)}
                    <span className="ml-1 text-xs font-normal text-gray-400">/ yr</span>
                  </td>
                  <td className="px-4 py-4 text-right text-sm tabular-nums text-gray-700">
                    {t.clientCount}
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => setEditTarget(t)}
                        aria-label={`Edit ${t.name}`}
                        className="hover:text-brand-teal-500 rounded-lg p-1.5 text-gray-400 transition-all hover:bg-brand-warm-50"
                      >
                        <Pencil size={14} strokeWidth={1.5} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(t)}
                        aria-label={`Delete ${t.name}`}
                        className="rounded-lg p-1.5 text-gray-400 transition-all hover:bg-red-50 hover:text-red-500"
                      >
                        <Trash2 size={14} strokeWidth={1.5} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {createOpen && <CreateTierModal onClose={() => setCreateOpen(false)} />}
      {editTarget && <EditTierModal tier={editTarget} onClose={() => setEditTarget(null)} />}
      {deleteTarget && (
        <DeleteTierModal tier={deleteTarget} onClose={() => setDeleteTarget(null)} />
      )}
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

// ---------- Tier modals ----------

interface TierFormState {
  name: string;
  amountInput: string;
  description: string;
}

function CreateTierModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<TierFormState>({
    name: '',
    amountInput: '',
    description: '',
  });

  function submit() {
    setError(null);
    const parsed = parseDollarsToCents(form.amountInput);
    if (!form.name.trim()) {
      setError('Tier name is required.');
      return;
    }
    if (parsed === null || parsed <= 0) {
      setError('Enter a valid annual price greater than zero.');
      return;
    }
    startTransition(async () => {
      const result = await createTier({
        name: form.name.trim(),
        annualPriceCents: parsed,
        description: form.description.trim() || null,
      });
      if (!result.success) {
        setError(result.error);
        showToast(result.error, 'error');
        return;
      }
      showToast('Tier created');
      onClose();
      router.refresh();
    });
  }

  return (
    <TierFormModal
      title="New tier"
      form={form}
      setForm={setForm}
      error={error}
      isPending={isPending}
      onClose={onClose}
      onSubmit={submit}
      submitLabel="Create tier"
      submittingLabel="Creating..."
    />
  );
}

function EditTierModal({ tier, onClose }: { tier: MembershipTierRow; onClose: () => void }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<TierFormState>({
    name: tier.name,
    amountInput: (tier.annualPriceCents / 100).toFixed(2),
    description: tier.description ?? '',
  });

  function submit() {
    setError(null);
    const parsed = parseDollarsToCents(form.amountInput);
    if (!form.name.trim()) {
      setError('Tier name is required.');
      return;
    }
    if (parsed === null || parsed <= 0) {
      setError('Enter a valid annual price greater than zero.');
      return;
    }
    startTransition(async () => {
      const result = await updateTier(tier.id, {
        name: form.name.trim(),
        annualPriceCents: parsed,
        description: form.description.trim() || null,
      });
      if (!result.success) {
        setError(result.error);
        showToast(result.error, 'error');
        return;
      }
      showToast('Tier updated');
      onClose();
      router.refresh();
    });
  }

  return (
    <TierFormModal
      title={`Edit ${tier.name}`}
      form={form}
      setForm={setForm}
      error={error}
      isPending={isPending}
      onClose={onClose}
      onSubmit={submit}
      submitLabel="Save changes"
      submittingLabel="Saving..."
    />
  );
}

interface TierFormModalProps {
  title: string;
  form: TierFormState;
  setForm: React.Dispatch<React.SetStateAction<TierFormState>>;
  error: string | null;
  isPending: boolean;
  onClose: () => void;
  onSubmit: () => void;
  submitLabel: string;
  submittingLabel: string;
}

function TierFormModal({
  title,
  form,
  setForm,
  error,
  isPending,
  onClose,
  onSubmit,
  submitLabel,
  submittingLabel,
}: TierFormModalProps) {
  const parsedCents = useMemo(() => parseDollarsToCents(form.amountInput), [form.amountInput]);
  const preview = parsedCents !== null && parsedCents > 0 ? formatCentsExact(parsedCents) : null;

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
            placeholder="e.g. Premier"
            className={inputClass}
          />
        </Field>

        <Field
          label="Annual price"
          required
          hint={preview ? `Will save as ${preview}` : 'Dollars — commas optional'}
        >
          <div className="relative">
            <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-sm text-gray-400">
              $
            </span>
            <input
              type="text"
              inputMode="decimal"
              value={form.amountInput}
              onChange={(e) => setForm((prev) => ({ ...prev, amountInput: e.target.value }))}
              placeholder="12,000.00"
              className={cn(inputClass, 'pl-8')}
            />
          </div>
        </Field>

        <Field label="Description" hint="Optional — shown when assigning clients to this tier.">
          <textarea
            value={form.description}
            onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
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

function DeleteTierModal({ tier, onClose }: { tier: MembershipTierRow; onClose: () => void }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await deleteTier(tier.id);
      if (!result.success) {
        setError(result.error);
        showToast(result.error, 'error');
        return;
      }
      showToast(`Tier "${tier.name}" deleted`);
      onClose();
      router.refresh();
    });
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Delete tier?"
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
            {isPending ? 'Deleting...' : 'Delete'}
          </button>
        </>
      }
    >
      <p className="mb-3 text-sm text-gray-700">
        You&apos;re about to delete <strong className="font-semibold">{tier.name}</strong>.
      </p>
      <p className="text-sm text-gray-500">
        {tier.clientCount > 0 ? (
          <>
            <strong className="font-semibold">
              {tier.clientCount} {tier.clientCount === 1 ? 'client is' : 'clients are'}
            </strong>{' '}
            currently on this tier. They&apos;ll be moved to &ldquo;No tier&rdquo;.
          </>
        ) : (
          'No clients are on this tier.'
        )}
      </p>
      {error && (
        <div className="mt-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}
    </Modal>
  );
}

// ---------- Email templates ----------

function EmailTemplatesSection({ templates }: { templates: EmailTemplateRow[] }) {
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Email templates</h2>
        <p className="mt-1 text-sm text-gray-500">
          Saved copy for automated emails. Stored only — sending is wired up in a future session.
        </p>
      </div>

      {templates.length === 0 ? (
        <div className="shadow-card rounded-2xl bg-white p-12 text-center">
          <div className="bg-brand-warm-200 mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full text-gray-400">
            <Mail size={24} strokeWidth={1.5} />
          </div>
          <h3 className="text-base font-semibold text-gray-900">No email templates yet</h3>
          <p className="mx-auto mt-2 max-w-sm text-sm text-gray-500">
            Templates are seeded by migrations. Once one exists, you can edit it here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map((t) => (
            <EmailTemplateCard
              key={t.id}
              template={t}
              editing={editingId === t.id}
              onEdit={() => setEditingId(t.id)}
              onCancel={() => setEditingId(null)}
              onSaved={() => setEditingId(null)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface EmailTemplateCardProps {
  template: EmailTemplateRow;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSaved: () => void;
}

function EmailTemplateCard({
  template,
  editing,
  onEdit,
  onCancel,
  onSaved,
}: EmailTemplateCardProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [subject, setSubject] = useState(template.subject);
  const [body, setBody] = useState(template.body);

  function save() {
    setError(null);
    if (!subject.trim()) {
      setError('Subject is required.');
      return;
    }
    if (!body.trim()) {
      setError('Body is required.');
      return;
    }
    startTransition(async () => {
      const result = await updateEmailTemplate(template.id, {
        subject: subject.trim(),
        body: body.trim(),
      });
      if (!result.success) {
        setError(result.error);
        showToast(result.error, 'error');
        return;
      }
      showToast('Email template saved');
      onSaved();
      router.refresh();
    });
  }

  function cancel() {
    setSubject(template.subject);
    setBody(template.body);
    setError(null);
    onCancel();
  }

  return (
    <div className="shadow-card rounded-2xl bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-gray-900">{template.name}</h3>
          {!editing && (
            <p className="mt-1 truncate text-xs text-gray-500">{template.subject}</p>
          )}
          <div className="mt-1 text-[11px] text-gray-400">
            Last edited {template.updatedAt.toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
            {template.lastEditedByName ? ` by ${template.lastEditedByName}` : ''}
          </div>
        </div>
        {!editing && (
          <button
            type="button"
            onClick={onEdit}
            className="hover:text-brand-teal-500 inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-gray-500 transition-all hover:bg-brand-warm-50"
          >
            <Pencil size={12} strokeWidth={1.5} />
            Edit
          </button>
        )}
      </div>

      {editing && (
        <div className="mt-4 space-y-4 border-t border-gray-100 pt-4">
          <Field label="Subject" required>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Body" required hint="Plain text for now; rich formatting comes later.">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              className={textareaClass}
            />
          </Field>

          {error && (
            <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={cancel}
              disabled={isPending}
              className="rounded-xl px-4 py-2 text-sm font-medium text-gray-700 transition-all hover:bg-gray-100 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={isPending}
              className="bg-brand-gold-400 hover:bg-brand-gold-500 shadow-soft rounded-xl px-4 py-2 text-sm font-medium text-white transition-all disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- helpers ----------

/** Same parser as the invoice upload modal — strip $ / commas / spaces,
 *  reject NaN or negative, `Math.round` to dodge FP drift. */
function parseDollarsToCents(input: string): number | null {
  const cleaned = input.replace(/[\s,$]/g, '');
  if (!cleaned) return null;
  const dollars = Number.parseFloat(cleaned);
  if (!Number.isFinite(dollars) || dollars < 0) return null;
  return Math.round(dollars * 100);
}

function formatCentsExact(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}
