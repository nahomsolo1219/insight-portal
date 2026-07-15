'use client';

// Five-step plan builder. Lives in one client component with internal
// state; on submit it calls `createMaintenancePlan` and navigates to
// the new plan's detail page on success.
//
// Steps:
//   1. Basics — property, name, duration mode, start/end
//   2. Visits — count + auto-distribute toggle, editable preview list
//   3. Scope per visit — chip-based multi-select, copy-to-all helper
//   4. Billing — total + cadence (docs deferred to detail page)
//   5. Review — summary + Create

import { Check, ChevronLeft, ChevronRight, Plus, Trash2, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { Field, inputClass, textareaClass } from '@/components/admin/Field';
import { LoadingDots } from '@/components/admin/LoadingDots';
import { Modal } from '@/components/admin/Modal';
import { useToast } from '@/components/admin/ToastProvider';
import { computeDefaultEndDate, distributeVisits } from '@/lib/maintenance/recurrence';
import { SCOPE_TYPES } from '@/lib/maintenance/scope-types';
import { cn } from '@/lib/utils';
import { BILLING_CADENCES } from '@/lib/maintenance/constants';
import {
  createMaintenancePlan,
  type ScopeItemInput,
  type VisitInput,
} from './actions';
import type {
  FieldStaffPickerRow,
  PropertyPickerRow,
  VendorPickerRow,
} from './queries';

interface VisitDraft {
  scheduledDate: string;
  title: string;
  visitOrder: number;
  scopeItems: ScopeItemDraft[];
}

interface ScopeItemDraft {
  scopeType: string;
  customLabel: string;
}

type DurationMode = 'calendar_year' | 'rolling_12' | 'custom';

interface NewPlanModalProps {
  properties: PropertyPickerRow[];
  vendors: VendorPickerRow[];
  fieldStaff: FieldStaffPickerRow[];
  onClose: () => void;
}

const STEPS = ['Basics', 'Visits', 'Scope', 'Billing', 'Review'] as const;
type StepIndex = 0 | 1 | 2 | 3 | 4;

export function NewPlanModal({ properties, vendors, fieldStaff, onClose }: NewPlanModalProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState<StepIndex>(0);
  const [error, setError] = useState<string | null>(null);

  // ---- form state -------------------------------------------------------
  const [propertyId, setPropertyId] = useState<string>('');
  const [planName, setPlanName] = useState('');
  const [duration, setDuration] = useState<DurationMode>('calendar_year');
  const [startDate, setStartDate] = useState(() => `${new Date().getUTCFullYear()}-01-01`);
  const [endDate, setEndDate] = useState(() =>
    computeDefaultEndDate(`${new Date().getUTCFullYear()}-01-01`, 'calendar_year'),
  );
  const [visitCount, setVisitCount] = useState(4);
  const [autoDistribute, setAutoDistribute] = useState(true);
  const [visits, setVisits] = useState<VisitDraft[]>(() =>
    distributeVisits({
      startDate: `${new Date().getUTCFullYear()}-01-01`,
      endDate: computeDefaultEndDate(`${new Date().getUTCFullYear()}-01-01`, 'calendar_year'),
      visitCount: 4,
    }).map((v) => ({
      ...v,
      scopeItems: [{ scopeType: 'hvac', customLabel: '' }],
    })),
  );
  const [billingTotalDollars, setBillingTotalDollars] = useState('');
  const [billingCadence, setBillingCadence] = useState<string>('');
  const [notes, setNotes] = useState('');

  const selectedProperty = useMemo(
    () => properties.find((p) => p.id === propertyId) ?? null,
    [properties, propertyId],
  );

  // Auto-suggest plan name when property changes — only if admin
  // hasn't typed anything yet, so we never clobber typed input.
  function pickProperty(newId: string) {
    setPropertyId(newId);
    if (!planName.trim()) {
      const prop = properties.find((p) => p.id === newId);
      if (prop) {
        const year = startDate.slice(0, 4);
        setPlanName(`${year} ${prop.clientName} Plan`);
      }
    }
  }

  function changeDuration(next: DurationMode) {
    setDuration(next);
    if (next !== 'custom') {
      const newEnd = computeDefaultEndDate(startDate, next);
      setEndDate(newEnd);
      regenerateVisits(startDate, newEnd, visitCount);
    }
  }

  function changeStartDate(next: string) {
    setStartDate(next);
    if (duration !== 'custom') {
      const newEnd = computeDefaultEndDate(next, duration);
      setEndDate(newEnd);
      regenerateVisits(next, newEnd, visitCount);
    } else {
      regenerateVisits(next, endDate, visitCount);
    }
  }

  function changeEndDate(next: string) {
    setEndDate(next);
    if (autoDistribute) regenerateVisits(startDate, next, visitCount);
  }

  function regenerateVisits(start: string, end: string, count: number) {
    if (!autoDistribute) return;
    const next = distributeVisits({ startDate: start, endDate: end, visitCount: count });
    setVisits(
      next.map((v, i) => ({
        ...v,
        // Preserve existing scope when the rebuild covers the same
        // visit slot — admin's already-edited scope shouldn't reset
        // when they bump the visit count.
        scopeItems:
          visits[i]?.scopeItems ?? [{ scopeType: 'hvac', customLabel: '' }],
      })),
    );
  }

  function changeVisitCount(next: number) {
    const clamped = Math.max(0, Math.min(52, Math.floor(next)));
    setVisitCount(clamped);
    regenerateVisits(startDate, endDate, clamped);
  }

  function setAutoDistributeAndRebuild(value: boolean) {
    setAutoDistribute(value);
    if (value) {
      const next = distributeVisits({ startDate, endDate, visitCount });
      setVisits(
        next.map((v, i) => ({
          ...v,
          scopeItems: visits[i]?.scopeItems ?? [{ scopeType: 'hvac', customLabel: '' }],
        })),
      );
    }
  }

  function updateVisit(index: number, patch: Partial<VisitDraft>) {
    setVisits((prev) => prev.map((v, i) => (i === index ? { ...v, ...patch } : v)));
  }

  function addBlankVisit() {
    setVisits((prev) => [
      ...prev,
      {
        scheduledDate: endDate,
        title: `Visit ${prev.length + 1}`,
        visitOrder: prev.length,
        scopeItems: [{ scopeType: 'hvac', customLabel: '' }],
      },
    ]);
  }

  function removeVisit(index: number) {
    setVisits((prev) =>
      prev
        .filter((_, i) => i !== index)
        .map((v, i) => ({ ...v, visitOrder: i })),
    );
  }

  function toggleScope(visitIndex: number, scopeType: string) {
    const visit = visits[visitIndex];
    if (!visit) return;
    const exists = visit.scopeItems.some((s) => s.scopeType === scopeType);
    const nextItems = exists
      ? visit.scopeItems.filter((s) => s.scopeType !== scopeType)
      : [...visit.scopeItems, { scopeType, customLabel: '' }];
    updateVisit(visitIndex, { scopeItems: nextItems });
  }

  function copyScopeToAll(fromIndex: number) {
    const source = visits[fromIndex]?.scopeItems ?? [];
    const cloned = source.map((s) => ({ ...s }));
    setVisits((prev) => prev.map((v) => ({ ...v, scopeItems: cloned.map((s) => ({ ...s })) })));
  }

  function setRotatingScope() {
    // Simple Q1: HVAC, Q2: plumbing, Q3: electrical, Q4: roof
    // — only meaningful for 4 visits, but the helper still rotates
    // through the list when there are fewer or more.
    const rotation = ['hvac', 'plumbing', 'electrical', 'roof_exterior'];
    setVisits((prev) =>
      prev.map((v, i) => ({
        ...v,
        scopeItems: [{ scopeType: rotation[i % rotation.length], customLabel: '' }],
      })),
    );
  }

  // ---- step transitions / validation ------------------------------------

  function canAdvance(from: StepIndex): { ok: true } | { ok: false; reason: string } {
    if (from === 0) {
      if (!propertyId) return { ok: false, reason: 'Pick a property.' };
      if (!planName.trim()) return { ok: false, reason: 'Plan name is required.' };
      if (!startDate) return { ok: false, reason: 'Start date is required.' };
      if (!endDate) return { ok: false, reason: 'End date is required.' };
      if (startDate > endDate) {
        return { ok: false, reason: 'End date must be after start date.' };
      }
    }
    if (from === 1) {
      if (visitCount < 0) return { ok: false, reason: 'Visit count can’t be negative.' };
      if (visits.length === 0 && visitCount > 0) {
        return { ok: false, reason: 'No visits generated.' };
      }
      for (const v of visits) {
        if (!v.title.trim()) return { ok: false, reason: 'Every visit needs a title.' };
        if (v.scheduledDate < startDate || v.scheduledDate > endDate) {
          return { ok: false, reason: `Visit "${v.title}" falls outside the date range.` };
        }
      }
    }
    if (from === 2) {
      for (const v of visits) {
        for (const s of v.scopeItems) {
          if (s.scopeType === 'custom' && !s.customLabel.trim()) {
            return { ok: false, reason: `Custom scope on "${v.title}" needs a label.` };
          }
        }
      }
    }
    return { ok: true };
  }

  function next() {
    setError(null);
    const check = canAdvance(step);
    if (!check.ok) {
      setError(check.reason);
      return;
    }
    setStep((s) => Math.min(4, s + 1) as StepIndex);
  }

  function back() {
    setError(null);
    setStep((s) => Math.max(0, s - 1) as StepIndex);
  }

  function submit(activate: boolean) {
    setError(null);
    const validation = canAdvance(2); // re-validate scope step
    if (!validation.ok) {
      setError(validation.reason);
      return;
    }

    const billingCents = parseDollarsToCents(billingTotalDollars);
    if (billingTotalDollars.trim() && billingCents == null) {
      setError('Billing total must be a number (e.g. 4800).');
      return;
    }

    const visitInputs: VisitInput[] = visits.map((v) => ({
      scheduledDate: v.scheduledDate,
      title: v.title.trim(),
      visitOrder: v.visitOrder,
      scopeItems: v.scopeItems.map<ScopeItemInput>((s) => ({
        scopeType: s.scopeType,
        customLabel: s.scopeType === 'custom' ? s.customLabel.trim() : null,
      })),
    }));

    startTransition(async () => {
      const result = await createMaintenancePlan({
        propertyId,
        name: planName.trim(),
        startDate,
        endDate,
        visitCount,
        autoDistribute: false, // we always pass the resolved visits
        visits: visitInputs,
        billingTotalCents: billingCents,
        billingCadence: billingCadence || null,
        notes: notes.trim() || null,
        activate,
      });

      if (!result.success) {
        setError(result.error);
        return;
      }
      showToast('Plan created', 'success');
      router.push(`/admin/maintenance/${result.planId}`);
      router.refresh();
    });
  }

  // ---- render -----------------------------------------------------------

  return (
    <Modal
      open
      onClose={onClose}
      locked={pending}
      size="lg"
      title="New maintenance plan"
      description="Build a plan from scratch. You can edit anything later."
      footer={
        <ModalFooter
          step={step}
          pending={pending}
          onBack={back}
          onNext={next}
          onCreate={() => submit(true)}
          onSaveDraft={() => submit(false)}
        />
      }
    >
      <Stepper step={step} />
      {error && (
        <div className="mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {step === 0 && (
        <BasicsStep
          properties={properties}
          propertyId={propertyId}
          onPickProperty={pickProperty}
          planName={planName}
          onPlanName={setPlanName}
          duration={duration}
          onDuration={changeDuration}
          startDate={startDate}
          onStartDate={changeStartDate}
          endDate={endDate}
          onEndDate={changeEndDate}
        />
      )}

      {step === 1 && (
        <VisitsStep
          visits={visits}
          visitCount={visitCount}
          onVisitCount={changeVisitCount}
          autoDistribute={autoDistribute}
          onAutoDistribute={setAutoDistributeAndRebuild}
          onUpdateVisit={updateVisit}
          onAddVisit={addBlankVisit}
          onRemoveVisit={removeVisit}
          startDate={startDate}
          endDate={endDate}
        />
      )}

      {step === 2 && (
        <ScopeStep
          visits={visits}
          onToggleScope={toggleScope}
          onUpdateVisit={updateVisit}
          onCopyToAll={copyScopeToAll}
          onSetRotating={setRotatingScope}
          vendors={vendors}
        />
      )}

      {step === 3 && (
        <BillingStep
          billingTotalDollars={billingTotalDollars}
          onBillingTotal={setBillingTotalDollars}
          billingCadence={billingCadence}
          onBillingCadence={setBillingCadence}
          notes={notes}
          onNotes={setNotes}
        />
      )}

      {step === 4 && (
        <ReviewStep
          property={selectedProperty}
          planName={planName}
          startDate={startDate}
          endDate={endDate}
          visits={visits}
          billingTotalDollars={billingTotalDollars}
          billingCadence={billingCadence}
          notes={notes}
        />
      )}

      {/* Field staff pickers aren't part of the builder yet — admin
          assigns staff per visit on the detail page. Keep the prop
          alive so the closure doesn't drop them. */}
      <span className="hidden">{fieldStaff.length}</span>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Step components
// ---------------------------------------------------------------------------

function Stepper({ step }: { step: StepIndex }) {
  return (
    <ol className="mb-6 -mx-1 flex items-center gap-2 overflow-x-auto px-1 text-xs font-medium text-ink-500 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {STEPS.map((label, i) => (
        <li key={label} className="flex flex-shrink-0 items-center gap-2 whitespace-nowrap">
          <span
            className={cn(
              'inline-flex h-6 min-w-6 items-center justify-center rounded-full px-2 text-[11px] font-semibold tabular-nums',
              i === step
                ? 'bg-brand-gold-500 text-white'
                : i < step
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-cream text-ink-500',
            )}
          >
            {i < step ? <Check size={12} strokeWidth={2.5} /> : i + 1}
          </span>
          <span className={cn(i === step ? 'text-ink-900' : '')}>{label}</span>
          {i < STEPS.length - 1 && <span className="text-ink-300">›</span>}
        </li>
      ))}
    </ol>
  );
}

function BasicsStep({
  properties,
  propertyId,
  onPickProperty,
  planName,
  onPlanName,
  duration,
  onDuration,
  startDate,
  onStartDate,
  endDate,
  onEndDate,
}: {
  properties: PropertyPickerRow[];
  propertyId: string;
  onPickProperty: (id: string) => void;
  planName: string;
  onPlanName: (v: string) => void;
  duration: DurationMode;
  onDuration: (v: DurationMode) => void;
  startDate: string;
  onStartDate: (v: string) => void;
  endDate: string;
  onEndDate: (v: string) => void;
}) {
  return (
    <div className="space-y-5">
      <Field label="Property" required hint="Only properties on active clients are listed.">
        <select
          className={inputClass}
          value={propertyId}
          onChange={(e) => onPickProperty(e.target.value)}
        >
          <option value="">Select a property…</option>
          {properties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.clientName} — {p.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Plan name" required hint="Suggested as {Year} {Client} Plan.">
        <input
          className={inputClass}
          value={planName}
          onChange={(e) => onPlanName(e.target.value)}
          placeholder="2026 Andersons Plan"
        />
      </Field>

      <Field label="Duration">
        <div className="flex flex-wrap gap-2">
          {(
            [
              { id: 'calendar_year', label: 'Calendar year' },
              { id: 'rolling_12', label: 'Rolling 12 months' },
              { id: 'custom', label: 'Custom range' },
            ] as { id: DurationMode; label: string }[]
          ).map((opt) => {
            const active = opt.id === duration;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => onDuration(opt.id)}
                className={cn(
                  'rounded-xl border px-4 py-2 text-sm font-medium transition-all',
                  active
                    ? 'border-brand-teal-500/30 bg-brand-teal-50 text-brand-teal-500'
                    : 'border-line bg-paper text-ink-700 hover:border-brand-teal-300 hover:bg-cream',
                )}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Start date" required>
          <input
            type="date"
            className={inputClass}
            value={startDate}
            onChange={(e) => onStartDate(e.target.value)}
          />
        </Field>
        <Field
          label="End date"
          required
          hint={
            duration === 'custom'
              ? 'Custom — pick whatever you like.'
              : 'Auto-calculated from start date.'
          }
        >
          <input
            type="date"
            className={inputClass}
            value={endDate}
            onChange={(e) => onEndDate(e.target.value)}
            disabled={duration !== 'custom'}
          />
        </Field>
      </div>
    </div>
  );
}

function VisitsStep({
  visits,
  visitCount,
  onVisitCount,
  autoDistribute,
  onAutoDistribute,
  onUpdateVisit,
  onAddVisit,
  onRemoveVisit,
  startDate,
  endDate,
}: {
  visits: VisitDraft[];
  visitCount: number;
  onVisitCount: (n: number) => void;
  autoDistribute: boolean;
  onAutoDistribute: (v: boolean) => void;
  onUpdateVisit: (index: number, patch: Partial<VisitDraft>) => void;
  onAddVisit: () => void;
  onRemoveVisit: (index: number) => void;
  startDate: string;
  endDate: string;
}) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Number of visits" hint="Quarterly = 4. Monthly = 12.">
          <input
            type="number"
            min={0}
            max={52}
            className={inputClass}
            value={visitCount}
            onChange={(e) => onVisitCount(Number(e.target.value))}
          />
        </Field>
        <Field label="Auto-distribute" hint="Spaces visits evenly across the date range.">
          <label className="inline-flex items-center gap-3 rounded-xl border border-line bg-cream px-4 py-2.5 text-sm text-ink-700">
            <input
              type="checkbox"
              checked={autoDistribute}
              onChange={(e) => onAutoDistribute(e.target.checked)}
            />
            On
          </label>
        </Field>
      </div>

      {visits.length === 0 ? (
        <div className="rounded-xl border border-line bg-cream p-6 text-center text-sm text-ink-500">
          No visits yet. Set a count above or add one manually.
        </div>
      ) : (
        <div className="space-y-2">
          {visits.map((v, i) => (
            <div
              key={i}
              className="flex flex-wrap items-end gap-3 rounded-xl border border-line bg-paper p-4"
            >
              <div className="flex-1 min-w-[180px]">
                <label className="text-ink-500 mb-1 block text-[11px] font-medium uppercase tracking-wider">
                  Title
                </label>
                <input
                  className={inputClass}
                  value={v.title}
                  onChange={(e) => onUpdateVisit(i, { title: e.target.value })}
                />
              </div>
              <div>
                <label className="text-ink-500 mb-1 block text-[11px] font-medium uppercase tracking-wider">
                  Date
                </label>
                <input
                  type="date"
                  className={inputClass}
                  min={startDate}
                  max={endDate}
                  value={v.scheduledDate}
                  onChange={(e) => onUpdateVisit(i, { scheduledDate: e.target.value })}
                />
              </div>
              <button
                type="button"
                aria-label={`Remove visit ${i + 1}`}
                onClick={() => onRemoveVisit(i)}
                className="rounded-lg p-2 text-ink-400 transition-colors hover:bg-red-50 hover:text-red-500"
              >
                <Trash2 size={16} strokeWidth={1.5} />
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={onAddVisit}
        className="inline-flex items-center gap-2 rounded-xl border border-brand-teal-200 bg-brand-teal-50 px-4 py-2 text-sm font-medium text-brand-teal-500 transition-colors hover:border-brand-teal-300"
      >
        <Plus size={14} strokeWidth={2} />
        Add visit
      </button>
    </div>
  );
}

function ScopeStep({
  visits,
  onToggleScope,
  onUpdateVisit,
  onCopyToAll,
  onSetRotating,
  vendors,
}: {
  visits: VisitDraft[];
  onToggleScope: (visitIndex: number, scopeType: string) => void;
  onUpdateVisit: (index: number, patch: Partial<VisitDraft>) => void;
  onCopyToAll: (fromIndex: number) => void;
  onSetRotating: () => void;
  vendors: VendorPickerRow[];
}) {
  // We don't surface per-scope-item vendor pickers in the builder
  // (kept the builder lean); admin assigns vendors on the detail
  // page where they have more room. Vendors prop kept for future
  // extension.
  void vendors;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-ink-500">
          Pick what each visit covers. Same chip set every time.
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onCopyToAll(0)}
            className="rounded-xl border border-line bg-paper px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-cream"
          >
            Copy first to all
          </button>
          <button
            type="button"
            onClick={onSetRotating}
            className="rounded-xl border border-line bg-paper px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-cream"
          >
            Set rotating scope
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {visits.map((v, i) => (
          <div key={i} className="rounded-xl border border-line bg-paper p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="text-ink-900 text-sm font-medium">{v.title}</div>
                <div className="text-ink-500 text-xs tabular-nums">{v.scheduledDate}</div>
              </div>
              <span className="text-ink-500 text-xs tabular-nums">
                {v.scopeItems.length} item{v.scopeItems.length === 1 ? '' : 's'}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {SCOPE_TYPES.map((s) => {
                const Icon = s.icon;
                const active = v.scopeItems.some((it) => it.scopeType === s.value);
                return (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => onToggleScope(i, s.value)}
                    className={cn(
                      'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-all',
                      active
                        ? 'border-brand-teal-500/30 bg-brand-teal-50 text-brand-teal-500'
                        : 'border-line bg-paper text-ink-500 hover:border-brand-teal-300 hover:text-brand-teal-500',
                    )}
                  >
                    <Icon size={12} strokeWidth={1.5} />
                    {s.label}
                    {active && <X size={11} strokeWidth={2} className="opacity-60" />}
                  </button>
                );
              })}
            </div>
            {v.scopeItems.some((it) => it.scopeType === 'custom') && (
              <div className="mt-3">
                <Field label="Custom item label" required>
                  <input
                    className={inputClass}
                    placeholder="e.g. Cellar audit"
                    value={
                      v.scopeItems.find((it) => it.scopeType === 'custom')?.customLabel ?? ''
                    }
                    onChange={(e) => {
                      const updated = v.scopeItems.map((it) =>
                        it.scopeType === 'custom'
                          ? { ...it, customLabel: e.target.value }
                          : it,
                      );
                      onUpdateVisit(i, { scopeItems: updated });
                    }}
                  />
                </Field>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function BillingStep({
  billingTotalDollars,
  onBillingTotal,
  billingCadence,
  onBillingCadence,
  notes,
  onNotes,
}: {
  billingTotalDollars: string;
  onBillingTotal: (v: string) => void;
  billingCadence: string;
  onBillingCadence: (v: string) => void;
  notes: string;
  onNotes: (v: string) => void;
}) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Billing total (USD)" hint="Optional. Total contracted price.">
          <input
            type="text"
            inputMode="decimal"
            className={inputClass}
            value={billingTotalDollars}
            onChange={(e) => onBillingTotal(e.target.value)}
            placeholder="4800"
          />
        </Field>
        <Field label="Billing cadence" hint="How the client pays.">
          <select
            className={inputClass}
            value={billingCadence}
            onChange={(e) => onBillingCadence(e.target.value)}
          >
            <option value="">Not set</option>
            {BILLING_CADENCES.map((c) => (
              <option key={c} value={c}>
                {prettyCadence(c)}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Notes" hint="Internal note — not shown to clients.">
        <textarea
          className={textareaClass}
          rows={4}
          value={notes}
          onChange={(e) => onNotes(e.target.value)}
        />
      </Field>

      <div className="rounded-xl border border-line bg-cream p-4 text-xs text-ink-500">
        Home assessment + playbook PDFs upload from the plan detail page after creation.
      </div>
    </div>
  );
}

function ReviewStep({
  property,
  planName,
  startDate,
  endDate,
  visits,
  billingTotalDollars,
  billingCadence,
  notes,
}: {
  property: PropertyPickerRow | null;
  planName: string;
  startDate: string;
  endDate: string;
  visits: VisitDraft[];
  billingTotalDollars: string;
  billingCadence: string;
  notes: string;
}) {
  const billingCents = parseDollarsToCents(billingTotalDollars);
  return (
    <div className="space-y-4 text-sm">
      <SummaryRow label="Property" value={property ? `${property.clientName} — ${property.name}` : '—'} />
      <SummaryRow label="Plan name" value={planName || '—'} />
      <SummaryRow label="Date range" value={`${startDate} → ${endDate}`} />
      <SummaryRow
        label="Visits"
        value={`${visits.length} visit${visits.length === 1 ? '' : 's'}`}
      />
      <SummaryRow
        label="Billing"
        value={
          billingCents != null
            ? `${formatDollarsLabel(billingCents)} ${billingCadence ? `(${prettyCadence(billingCadence)})` : ''}`
            : '—'
        }
      />
      {notes && <SummaryRow label="Notes" value={notes} />}
      <div className="rounded-xl border border-line bg-cream p-4 text-xs text-ink-500">
        Choosing <strong>Save as draft</strong> creates the plan in draft status; you can
        activate it from the detail page. <strong>Create &amp; activate</strong> publishes
        the plan immediately and surfaces it on the client&rsquo;s schedule.
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-line-2 grid grid-cols-3 items-center gap-3 border-b pb-3 last:border-0 last:pb-0">
      <div className="text-ink-500 text-[11px] font-semibold uppercase tracking-wider">{label}</div>
      <div className="col-span-2 text-ink-900">{value}</div>
    </div>
  );
}

function ModalFooter({
  step,
  pending,
  onBack,
  onNext,
  onCreate,
  onSaveDraft,
}: {
  step: StepIndex;
  pending: boolean;
  onBack: () => void;
  onNext: () => void;
  onCreate: () => void;
  onSaveDraft: () => void;
}) {
  if (step === 4) {
    return (
      <>
        <button
          type="button"
          onClick={onBack}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-medium text-ink-700 transition-all hover:bg-cream disabled:opacity-50"
        >
          <ChevronLeft size={14} strokeWidth={2} />
          Back
        </button>
        <button
          type="button"
          onClick={onSaveDraft}
          disabled={pending}
          className="rounded-xl border border-brand-teal-200 bg-brand-teal-50 px-4 py-2.5 text-sm font-medium text-brand-teal-500 transition-colors hover:border-brand-teal-300 disabled:opacity-50"
        >
          {pending ? <>Saving<LoadingDots /></> : 'Save as draft'}
        </button>
        <button
          type="button"
          onClick={onCreate}
          disabled={pending}
          className="bg-brand-gold-400 hover:bg-brand-gold-500 shadow-soft inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium text-white transition-all disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? <>Creating<LoadingDots /></> : 'Create & activate'}
        </button>
      </>
    );
  }
  return (
    <>
      <button
        type="button"
        onClick={onBack}
        disabled={pending || step === 0}
        className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-medium text-ink-700 transition-all hover:bg-cream disabled:opacity-30"
      >
        <ChevronLeft size={14} strokeWidth={2} />
        Back
      </button>
      <button
        type="button"
        onClick={onNext}
        disabled={pending}
        className="bg-brand-gold-400 hover:bg-brand-gold-500 shadow-soft inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium text-white transition-all disabled:cursor-not-allowed disabled:opacity-50"
      >
        Next
        <ChevronRight size={14} strokeWidth={2} />
      </button>
    </>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseDollarsToCents(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const num = Number(trimmed.replace(/[$,]/g, ''));
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.round(num * 100);
}

function formatDollarsLabel(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function prettyCadence(value: string): string {
  switch (value) {
    case 'annual':
      return 'Annual';
    case 'monthly':
      return 'Monthly';
    case 'quarterly':
      return 'Quarterly';
    case 'per_visit':
      return 'Per visit';
    default:
      return value;
  }
}
