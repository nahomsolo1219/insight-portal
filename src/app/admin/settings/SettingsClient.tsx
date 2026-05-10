'use client';

import {
  Building2,
  CreditCard,
  Mail,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useRef, useState, useTransition } from 'react';
import { Field, inputClass, textareaClass } from '@/components/admin/Field';
import { LoadingDots } from '@/components/admin/LoadingDots';
import { Modal } from '@/components/admin/Modal';
import { useToast } from '@/components/admin/ToastProvider';
import { cn, formatCurrency } from '@/lib/utils';
import type { CompanySettings } from '@/lib/company/queries';
import {
  createTier,
  deleteTier,
  resetBrandColors,
  removeFirmLogo,
  updateCompanySettings,
  updateEmailTemplate,
  updateTier,
  uploadFirmLogo,
} from './actions';
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
  company: CompanySettings;
}

export function SettingsClient({ tiers, emailTemplates, company }: SettingsClientProps) {
  const [active, setActive] = useState<SectionId>('company');

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-[220px_1fr]">
      {/* Vertical nav */}
      <nav className="shadow-soft-md h-fit rounded-2xl bg-paper p-2">
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
        {active === 'company' && <CompanySection company={company} />}
        {active === 'tiers' && <TiersSection tiers={tiers} />}
        {active === 'email' && <EmailTemplatesSection templates={emailTemplates} />}
      </div>
    </div>
  );
}

// ---------- Company ----------

function CompanySection({ company }: { company: CompanySettings }) {
  const { showToast } = useToast();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // --- Firm identity ---
  const [firmName, setFirmName] = useState(company.firmName);
  const [firmTagline, setFirmTagline] = useState(company.firmTagline ?? '');

  // --- Contact ---
  const [firmEmail, setFirmEmail] = useState(company.firmEmail ?? '');
  const [firmPhone, setFirmPhone] = useState(company.firmPhone ?? '');
  const [firmAddress, setFirmAddress] = useState(company.firmAddress ?? '');
  const [firmWebsite, setFirmWebsite] = useState(company.firmWebsite ?? '');
  const [businessHours, setBusinessHours] = useState(company.businessHours ?? '');

  // --- Branding ---
  const [brandPrimary, setBrandPrimary] = useState(company.brandPrimaryColor ?? '');
  const [brandAccent, setBrandAccent] = useState(company.brandAccentColor ?? '');

  // --- Invoice categories ---
  const [categories, setCategories] = useState<string[]>(company.defaultInvoiceCategories);
  const [newCategory, setNewCategory] = useState('');

  // --- Email ---
  const [emailFromName, setEmailFromName] = useState(company.emailFromName ?? '');
  const [emailFromAddress, setEmailFromAddress] = useState(company.emailFromAddress ?? '');
  const [emailReplyTo, setEmailReplyTo] = useState(company.emailReplyTo ?? '');

  const lightLogoRef = useRef<HTMLInputElement>(null);
  const darkLogoRef = useRef<HTMLInputElement>(null);

  function saveSection(input: Parameters<typeof updateCompanySettings>[0]) {
    startTransition(async () => {
      const result = await updateCompanySettings(input);
      if (result.success) {
        showToast('Settings saved');
        router.refresh();
      } else {
        showToast(result.error, 'error');
      }
    });
  }

  function handleLogoUpload(kind: 'light' | 'dark', file: File) {
    startTransition(async () => {
      const fd = new FormData();
      fd.append('file', file);
      const result = await uploadFirmLogo(fd, kind);
      if (result.success) {
        showToast(`${kind === 'light' ? 'Light' : 'Dark'} logo uploaded`);
        router.refresh();
      } else {
        showToast(result.error, 'error');
      }
    });
  }

  function handleLogoRemove(kind: 'light' | 'dark') {
    startTransition(async () => {
      const result = await removeFirmLogo(kind);
      if (result.success) {
        showToast('Logo removed');
        router.refresh();
      } else {
        showToast(result.error, 'error');
      }
    });
  }

  function handleResetColors() {
    startTransition(async () => {
      const result = await resetBrandColors();
      if (result.success) {
        setBrandPrimary('');
        setBrandAccent('');
        showToast('Brand colors reset to defaults');
        router.refresh();
      } else {
        showToast(result.error, 'error');
      }
    });
  }

  function addCategory() {
    const trimmed = newCategory.trim();
    if (!trimmed || categories.includes(trimmed)) return;
    const updated = [...categories, trimmed];
    setCategories(updated);
    setNewCategory('');
    saveSection({ defaultInvoiceCategories: updated });
  }

  function removeCategory(cat: string) {
    const updated = categories.filter((c) => c !== cat);
    setCategories(updated);
    saveSection({ defaultInvoiceCategories: updated });
  }

  return (
    <div className="space-y-6">
      {/* Firm identity */}
      <SectionCard title="Firm identity" description="Name, tagline, and logos.">
        <div className="space-y-4">
          <Field label="Firm name" required>
            <input className={inputClass} value={firmName} onChange={(e) => setFirmName(e.target.value)} />
          </Field>
          <Field label="Tagline">
            <input className={inputClass} value={firmTagline} onChange={(e) => setFirmTagline(e.target.value)} placeholder="Short marketing line" />
          </Field>
          <SaveButton disabled={isPending} onClick={() => saveSection({ firmName, firmTagline: firmTagline || null })} isPending={isPending} />

          <div className="border-line-2 border-t pt-4">
            <p className="mb-3 text-xs text-gray-500">Light logo for dark backgrounds (sidebar). Dark logo for light backgrounds (admin header).</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <LogoUpload
                label="Logo (light)"
                currentPath={company.logoLightUrl}
                inputRef={lightLogoRef}
                onUpload={(f) => handleLogoUpload('light', f)}
                onRemove={() => handleLogoRemove('light')}
                isPending={isPending}
              />
              <LogoUpload
                label="Logo (dark)"
                currentPath={company.logoDarkUrl}
                inputRef={darkLogoRef}
                onUpload={(f) => handleLogoUpload('dark', f)}
                onRemove={() => handleLogoRemove('dark')}
                isPending={isPending}
              />
            </div>
          </div>
        </div>
      </SectionCard>

      {/* Contact information */}
      <SectionCard title="Contact information" description="Primary firm contact details.">
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Email"><input className={inputClass} type="email" value={firmEmail} onChange={(e) => setFirmEmail(e.target.value)} /></Field>
            <Field label="Phone"><input className={inputClass} type="tel" value={firmPhone} onChange={(e) => setFirmPhone(e.target.value)} /></Field>
          </div>
          <Field label="Address"><input className={inputClass} value={firmAddress} onChange={(e) => setFirmAddress(e.target.value)} /></Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Website"><input className={inputClass} value={firmWebsite} onChange={(e) => setFirmWebsite(e.target.value)} placeholder="https://…" /></Field>
            <Field label="Business hours"><input className={inputClass} value={businessHours} onChange={(e) => setBusinessHours(e.target.value)} placeholder="Mon–Fri, 8 AM – 5 PM" /></Field>
          </div>
          <SaveButton disabled={isPending} onClick={() => saveSection({ firmEmail: firmEmail || null, firmPhone: firmPhone || null, firmAddress: firmAddress || null, firmWebsite: firmWebsite || null, businessHours: businessHours || null })} isPending={isPending} />
        </div>
      </SectionCard>

      {/* Branding */}
      <SectionCard title="Branding" description="Optional — leave blank to use the default Insight palette.">
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Primary color">
              <div className="flex items-center gap-2">
                <input type="color" value={brandPrimary || '#1B4F5A'} onChange={(e) => setBrandPrimary(e.target.value)} className="h-10 w-10 cursor-pointer rounded-lg border border-gray-200" />
                <input className={inputClass} value={brandPrimary} onChange={(e) => setBrandPrimary(e.target.value)} placeholder="#1B4F5A" />
              </div>
            </Field>
            <Field label="Accent color">
              <div className="flex items-center gap-2">
                <input type="color" value={brandAccent || '#C8963E'} onChange={(e) => setBrandAccent(e.target.value)} className="h-10 w-10 cursor-pointer rounded-lg border border-gray-200" />
                <input className={inputClass} value={brandAccent} onChange={(e) => setBrandAccent(e.target.value)} placeholder="#C8963E" />
              </div>
            </Field>
          </div>
          <div className="flex items-center gap-3">
            <SaveButton disabled={isPending} onClick={() => saveSection({ brandPrimaryColor: brandPrimary || null, brandAccentColor: brandAccent || null })} isPending={isPending} />
            {(company.brandPrimaryColor || company.brandAccentColor) && (
              <button type="button" onClick={handleResetColors} disabled={isPending} className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium text-gray-600 transition-all hover:bg-gray-100">
                <RotateCcw size={13} strokeWidth={1.5} /> Reset to defaults
              </button>
            )}
          </div>
        </div>
      </SectionCard>

      {/* Invoice categories */}
      <SectionCard title="Invoice categories" description="Default categories for the invoice creation flow.">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {categories.map((cat) => (
              <span key={cat} className="bg-brand-warm-200 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-700">
                {cat}
                <button type="button" onClick={() => removeCategory(cat)} className="text-gray-400 hover:text-red-500 transition-colors"><X size={12} strokeWidth={2} /></button>
              </span>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input className={inputClass} value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="Add category…" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCategory(); } }} />
            <button type="button" onClick={addCategory} disabled={!newCategory.trim()} className="bg-brand-teal-500 hover:bg-brand-teal-600 shadow-soft inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-medium text-white transition-all disabled:opacity-50">
              <Plus size={14} strokeWidth={2} /> Add
            </button>
          </div>
        </div>
      </SectionCard>

      {/* Email */}
      <SectionCard title="Email" description="These appear on outgoing client emails. Domain must be verified in Resend before sending.">
        <div className="space-y-4">
          <Field label="From name"><input className={inputClass} value={emailFromName} onChange={(e) => setEmailFromName(e.target.value)} placeholder="Insight Home Maintenance" /></Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="From address"><input className={inputClass} type="email" value={emailFromAddress} onChange={(e) => setEmailFromAddress(e.target.value)} placeholder="hello@insighthm.com" /></Field>
            <Field label="Reply-to address"><input className={inputClass} type="email" value={emailReplyTo} onChange={(e) => setEmailReplyTo(e.target.value)} placeholder="Optional" /></Field>
          </div>
          <SaveButton disabled={isPending} onClick={() => saveSection({ emailFromName: emailFromName || null, emailFromAddress: emailFromAddress || null, emailReplyTo: emailReplyTo || null })} isPending={isPending} />
        </div>
      </SectionCard>
    </div>
  );
}

function SectionCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="shadow-soft-md rounded-2xl bg-paper p-6">
      <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
      <p className="mt-1 mb-5 text-sm text-gray-500">{description}</p>
      {children}
    </div>
  );
}

function SaveButton({ disabled, onClick, isPending }: { disabled: boolean; onClick: () => void; isPending: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="bg-brand-gold-400 hover:bg-brand-gold-500 shadow-soft inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium text-white transition-all disabled:cursor-not-allowed disabled:opacity-50">
      {isPending ? <>Saving<LoadingDots /></> : 'Save changes'}
    </button>
  );
}

function LogoUpload({ label, currentPath, inputRef, onUpload, onRemove, isPending }: {
  label: string;
  currentPath: string | null;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onUpload: (file: File) => void;
  onRemove: () => void;
  isPending: boolean;
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold tracking-wider text-gray-500 uppercase">{label}</p>
      {currentPath ? (
        <div className="flex items-center gap-3">
          <div className="bg-brand-warm-200 flex h-12 w-24 items-center justify-center rounded-lg px-2">
            <span className="text-[10px] text-gray-500 truncate">{currentPath.split('/').pop()}</span>
          </div>
          <button type="button" onClick={() => inputRef.current?.click()} disabled={isPending} className="text-brand-teal-500 hover:text-brand-teal-600 text-xs font-medium transition-colors">Replace</button>
          <button type="button" onClick={onRemove} disabled={isPending} className="text-red-500 hover:text-red-600 text-xs font-medium transition-colors">Remove</button>
        </div>
      ) : (
        <button type="button" onClick={() => inputRef.current?.click()} disabled={isPending} className="border-brand-teal-200 hover:border-brand-teal-300 hover:bg-brand-teal-50 inline-flex items-center gap-1.5 rounded-xl border px-4 py-2 text-sm font-medium text-brand-teal-500 transition-all">
          <Upload size={14} strokeWidth={1.5} /> Upload
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/svg+xml,image/jpeg,image/webp"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onUpload(file);
          e.target.value = '';
        }}
      />
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
        <div className="shadow-soft-md rounded-2xl bg-paper p-12 text-center">
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
        <div className="shadow-soft-md overflow-hidden rounded-2xl bg-paper">
          <table className="w-full">
            <thead>
              <tr className="border-b border-line-2">
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
            className="bg-paper border border-line text-ink-700 hover:bg-cream rounded-lg px-4 py-2.5 font-medium transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={isPending}
            className="bg-brand-gold-500 hover:bg-brand-gold-600 text-paper rounded-lg px-4 py-2.5 font-medium transition disabled:cursor-not-allowed disabled:opacity-50"
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
        <div className="shadow-soft-md rounded-2xl bg-paper p-12 text-center">
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
    <div className="shadow-soft-md rounded-2xl bg-paper p-5">
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
        <div className="mt-4 space-y-4 border-t border-line-2 pt-4">
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
              {isPending ? (
                <>
                  Saving
                  <LoadingDots />
                </>
              ) : (
                'Save'
              )}
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
