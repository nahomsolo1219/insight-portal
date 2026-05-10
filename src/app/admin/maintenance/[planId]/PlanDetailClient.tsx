'use client';

// Tabbed view of a single maintenance plan: Overview, Visits,
// Documents, History. Visits are inline-editable for status, title,
// and date; scope changes use a dedicated modal. Documents tab
// uploads PDFs via uploadPlanDocument.

import {
  Calendar,
  CheckCircle2,
  Circle,
  ClipboardList,
  Download,
  FileText,
  History,
  ListChecks,
  Pencil,
  Plus,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useState, useTransition } from 'react';
import { Field, inputClass, textareaClass } from '@/components/admin/Field';
import { LoadingDots } from '@/components/admin/LoadingDots';
import { Modal } from '@/components/admin/Modal';
import { useToast } from '@/components/admin/ToastProvider';
import { resolveScopeLabel, SCOPE_TYPES } from '@/lib/maintenance/scope-types';
import { cn, formatCurrency, formatDate } from '@/lib/utils';
import { BILLING_CADENCES, type PlanStatus, type VisitStatus } from '@/lib/maintenance/constants';
import {
  addVisit,
  archivePlan,
  deleteVisit,
  markScopeItemComplete,
  setVisitScope,
  updatePlan,
  updateVisit,
  uploadPlanDocument,
  type ScopeItemInput,
} from '../actions';
import type {
  FieldStaffPickerRow,
  PlanAuditEntry,
  PlanDetail,
  ScopeItemRow,
  VendorPickerRow,
  VisitWithScope,
} from '../queries';

const TABS = [
  { id: 'overview', label: 'Overview', icon: ClipboardList },
  { id: 'visits', label: 'Visits', icon: ListChecks },
  { id: 'documents', label: 'Documents', icon: FileText },
  { id: 'history', label: 'History', icon: History },
] as const;
type TabId = (typeof TABS)[number]['id'];

interface PlanDetailClientProps {
  plan: PlanDetail;
  visits: VisitWithScope[];
  history: PlanAuditEntry[];
  vendors: VendorPickerRow[];
  fieldStaff: FieldStaffPickerRow[];
  signedHomeAssessmentUrl: string | null;
  signedPlaybookUrl: string | null;
}

export function PlanDetailClient({
  plan,
  visits,
  history,
  vendors,
  fieldStaff,
  signedHomeAssessmentUrl,
  signedPlaybookUrl,
}: PlanDetailClientProps) {
  const [tab, setTab] = useState<TabId>('overview');

  return (
    <div>
      <div className="bg-brand-warm-200 mb-6 inline-flex max-w-full gap-1 overflow-x-auto rounded-xl p-1">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium whitespace-nowrap transition-all',
                active
                  ? 'text-brand-teal-500 shadow-soft bg-paper'
                  : 'hover:text-brand-teal-500 text-gray-500',
              )}
            >
              <Icon size={14} strokeWidth={1.5} />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'overview' && <OverviewTab plan={plan} />}
      {tab === 'visits' && (
        <VisitsTab plan={plan} visits={visits} vendors={vendors} fieldStaff={fieldStaff} />
      )}
      {tab === 'documents' && (
        <DocumentsTab
          plan={plan}
          signedHomeAssessmentUrl={signedHomeAssessmentUrl}
          signedPlaybookUrl={signedPlaybookUrl}
        />
      )}
      {tab === 'history' && <HistoryTab history={history} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overview tab
// ---------------------------------------------------------------------------

function OverviewTab({ plan }: { plan: PlanDetail }) {
  const [editing, setEditing] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);

  return (
    <div className="space-y-6">
      <div className="shadow-soft-md rounded-2xl bg-paper p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-ink-900">Plan details</h3>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-brand-teal-200 bg-brand-teal-50 px-3 py-1.5 text-xs font-medium text-brand-teal-500 hover:border-brand-teal-300"
          >
            <Pencil size={12} strokeWidth={2} />
            Edit
          </button>
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
          <DT label="Status">
            <span className="capitalize">{plan.status}</span>
          </DT>
          <DT label="Date range">
            {formatDate(plan.startDate)} → {formatDate(plan.endDate)}
          </DT>
          <DT label="Billing total">
            {plan.billingTotalCents != null
              ? formatCurrency(plan.billingTotalCents)
              : '—'}
          </DT>
          <DT label="Billing cadence">{plan.billingCadence ?? '—'}</DT>
          <DT label="Notes" full>
            {plan.notes ? (
              <span className="whitespace-pre-line text-ink-700">{plan.notes}</span>
            ) : (
              <span className="text-ink-400">No notes.</span>
            )}
          </DT>
        </dl>
      </div>

      {plan.status !== 'archived' && (
        <div className="rounded-2xl border border-line bg-cream p-5 text-sm text-ink-700">
          Done with this plan?{' '}
          <button
            type="button"
            onClick={() => setArchiveOpen(true)}
            className="font-medium text-red-500 hover:underline"
          >
            Archive it
          </button>
          . History stays accessible.
        </div>
      )}

      {editing && <EditPlanModal plan={plan} onClose={() => setEditing(false)} />}
      {archiveOpen && (
        <ArchiveConfirmModal plan={plan} onClose={() => setArchiveOpen(false)} />
      )}
    </div>
  );
}

function DT({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? 'col-span-2' : ''}>
      <dt className="text-[11px] font-semibold tracking-wider text-ink-500 uppercase">
        {label}
      </dt>
      <dd className="mt-1 text-ink-900">{children}</dd>
    </div>
  );
}

function EditPlanModal({ plan, onClose }: { plan: PlanDetail; onClose: () => void }) {
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(plan.name);
  const [status, setStatus] = useState<PlanStatus>(plan.status as PlanStatus);
  const [startDate, setStartDate] = useState(plan.startDate);
  const [endDate, setEndDate] = useState(plan.endDate);
  const [billingDollars, setBillingDollars] = useState(
    plan.billingTotalCents != null ? String(plan.billingTotalCents / 100) : '',
  );
  const [billingCadence, setBillingCadence] = useState(plan.billingCadence ?? '');
  const [notes, setNotes] = useState(plan.notes ?? '');

  function save() {
    setError(null);
    const billingCents = billingDollars.trim() ? Math.round(Number(billingDollars) * 100) : null;
    if (billingDollars.trim() && (billingCents === null || !Number.isFinite(billingCents))) {
      setError('Billing total must be a number.');
      return;
    }
    startTransition(async () => {
      const result = await updatePlan(plan.id, {
        name,
        status,
        startDate,
        endDate,
        billingTotalCents: billingCents,
        billingCadence: billingCadence || null,
        notes,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      showToast('Plan updated', 'success');
      onClose();
    });
  }

  return (
    <Modal open onClose={onClose} locked={pending} title="Edit plan" size="lg">
      <div className="space-y-4">
        {error && (
          <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}
        <Field label="Plan name" required>
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Status">
            <select
              className={inputClass}
              value={status}
              onChange={(e) => setStatus(e.target.value as PlanStatus)}
            >
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
              <option value="archived">Archived</option>
            </select>
          </Field>
          <Field label="Billing cadence">
            <select
              className={inputClass}
              value={billingCadence}
              onChange={(e) => setBillingCadence(e.target.value)}
            >
              <option value="">Not set</option>
              {BILLING_CADENCES.map((c) => (
                <option key={c} value={c}>
                  {c.replace('_', ' ')}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Start date">
            <input
              type="date"
              className={inputClass}
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </Field>
          <Field label="End date">
            <input
              type="date"
              className={inputClass}
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </Field>
          <Field label="Billing total (USD)" hint="Leave blank to clear.">
            <input
              type="text"
              inputMode="decimal"
              className={inputClass}
              value={billingDollars}
              onChange={(e) => setBillingDollars(e.target.value)}
            />
          </Field>
        </div>
        <Field label="Notes">
          <textarea
            className={textareaClass}
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>
      </div>
      <div className="mt-6 flex justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          disabled={pending}
          className="rounded-xl px-4 py-2.5 text-sm font-medium text-ink-700 hover:bg-cream disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="bg-brand-gold-400 hover:bg-brand-gold-500 shadow-soft rounded-xl px-5 py-2.5 text-sm font-medium text-white transition-all disabled:opacity-50"
        >
          {pending ? <>Saving<LoadingDots /></> : 'Save changes'}
        </button>
      </div>
    </Modal>
  );
}

function ArchiveConfirmModal({
  plan,
  onClose,
}: {
  plan: PlanDetail;
  onClose: () => void;
}) {
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function confirm() {
    setError(null);
    startTransition(async () => {
      const result = await archivePlan(plan.id);
      if (!result.success) {
        setError(result.error);
        return;
      }
      showToast('Plan archived', 'success');
      onClose();
    });
  }

  return (
    <Modal open onClose={onClose} locked={pending} title="Archive this plan?" size="sm">
      <p className="text-sm text-ink-700">
        Archiving sets the plan status to <strong>archived</strong>. Visits stay in place;
        clients no longer see it as active. Reverse this any time from the Edit modal.
      </p>
      {error && (
        <div className="mt-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}
      <div className="mt-6 flex justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          disabled={pending}
          className="rounded-xl px-4 py-2.5 text-sm font-medium text-ink-700 hover:bg-cream disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={confirm}
          disabled={pending}
          className="shadow-soft rounded-xl bg-red-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50"
        >
          {pending ? <>Archiving<LoadingDots /></> : 'Archive plan'}
        </button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Visits tab
// ---------------------------------------------------------------------------

function VisitsTab({
  plan,
  visits,
  vendors,
  fieldStaff,
}: {
  plan: PlanDetail;
  visits: VisitWithScope[];
  vendors: VendorPickerRow[];
  fieldStaff: FieldStaffPickerRow[];
}) {
  const [addOpen, setAddOpen] = useState(false);

  if (visits.length === 0) {
    return (
      <div className="space-y-4">
        <div className="shadow-soft-md rounded-2xl bg-paper p-12 text-center">
          <div className="bg-cream mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full text-ink-400">
            <Calendar size={24} strokeWidth={1.5} />
          </div>
          <h2 className="text-ink-900 text-base font-semibold">No visits yet</h2>
          <p className="text-ink-500 mx-auto mt-2 max-w-sm text-sm">
            Add an ad-hoc visit to get started — most plans set their cadence at creation.
          </p>
        </div>
        <div className="text-center">
          <AddVisitButton onClick={() => setAddOpen(true)} />
        </div>
        {addOpen && (
          <AddVisitModal
            plan={plan}
            vendors={vendors}
            fieldStaff={fieldStaff}
            onClose={() => setAddOpen(false)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {visits.map((v) => (
        <VisitCard
          key={v.id}
          plan={plan}
          visit={v}
          vendors={vendors}
          fieldStaff={fieldStaff}
        />
      ))}
      <div className="pt-2">
        <AddVisitButton onClick={() => setAddOpen(true)} />
      </div>
      {addOpen && (
        <AddVisitModal
          plan={plan}
          vendors={vendors}
          fieldStaff={fieldStaff}
          onClose={() => setAddOpen(false)}
        />
      )}
    </div>
  );
}

function AddVisitButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-xl border border-brand-teal-200 bg-brand-teal-50 px-4 py-2 text-sm font-medium text-brand-teal-500 hover:border-brand-teal-300"
    >
      <Plus size={14} strokeWidth={2} />
      Add ad-hoc visit
    </button>
  );
}

function VisitCard({
  plan,
  visit,
  vendors,
  fieldStaff,
}: {
  plan: PlanDetail;
  visit: VisitWithScope;
  vendors: VendorPickerRow[];
  fieldStaff: FieldStaffPickerRow[];
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();
  const { showToast } = useToast();

  function setStatus(next: VisitStatus) {
    startTransition(async () => {
      const result = await updateVisit(visit.id, { status: next });
      if (!result.success) {
        showToast(result.error, 'error');
        return;
      }
      showToast('Visit updated', 'success');
    });
  }

  function toggleScopeItemDone(item: ScopeItemRow) {
    startTransition(async () => {
      const result = await markScopeItemComplete(item.id, item.completionNotes, !item.completed);
      if (!result.success) {
        showToast(result.error, 'error');
        return;
      }
    });
  }

  return (
    <div className="shadow-soft-md rounded-2xl bg-paper p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-ink-900 text-base font-medium">{visit.title}</h3>
            <VisitStatusBadge status={visit.status} />
            {visit.isAdHoc && (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                ad-hoc
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap gap-3 text-xs text-ink-500">
            <span className="tabular-nums">{formatDate(visit.scheduledDate)}</span>
            {visit.vendorName && <span>· {visit.vendorName}</span>}
            {visit.notes && <span>· {visit.notes}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={visit.status}
            onChange={(e) => setStatus(e.target.value as VisitStatus)}
            disabled={pending}
            className="rounded-lg border border-line bg-cream px-2.5 py-1.5 text-xs font-medium text-ink-700 focus:border-brand-teal-400 focus:outline-none focus:ring-2 focus:ring-brand-teal-200"
          >
            <option value="scheduled">Scheduled</option>
            <option value="in_progress">In progress</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <button
            type="button"
            onClick={() => setEditOpen(true)}
            className="inline-flex items-center gap-1 rounded-lg border border-line bg-paper px-2.5 py-1.5 text-xs font-medium text-ink-700 hover:bg-cream"
          >
            <Pencil size={11} strokeWidth={2} />
            Edit
          </button>
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="rounded-lg p-1.5 text-ink-400 transition-colors hover:bg-red-50 hover:text-red-500"
            aria-label="Delete visit"
          >
            <Trash2 size={14} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      <div className="mt-3 border-t border-line-2 pt-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">
            Scope ({visit.scopeItems.length})
          </div>
          <button
            type="button"
            onClick={() => setScopeOpen(true)}
            className="text-[11px] font-medium text-brand-teal-500 hover:underline"
          >
            Edit scope
          </button>
        </div>
        {visit.scopeItems.length === 0 ? (
          <div className="text-xs text-ink-400">No scope items.</div>
        ) : (
          <ul className="space-y-1.5">
            {visit.scopeItems.map((item) => (
              <li key={item.id} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => toggleScopeItemDone(item)}
                  disabled={pending}
                  className={cn(
                    'inline-flex flex-shrink-0 items-center justify-center transition-colors',
                    item.completed ? 'text-emerald-500' : 'text-ink-300 hover:text-brand-teal-500',
                  )}
                  aria-label={item.completed ? 'Mark not done' : 'Mark done'}
                >
                  {item.completed ? (
                    <CheckCircle2 size={16} strokeWidth={2} />
                  ) : (
                    <Circle size={16} strokeWidth={1.5} />
                  )}
                </button>
                <span
                  className={cn(
                    'text-sm',
                    item.completed ? 'text-ink-400 line-through' : 'text-ink-700',
                  )}
                >
                  {resolveScopeLabel(item.scopeType, item.customLabel)}
                </span>
                {item.vendorName && (
                  <span className="text-[11px] text-ink-400">· {item.vendorName}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {editOpen && (
        <EditVisitModal
          plan={plan}
          visit={visit}
          vendors={vendors}
          fieldStaff={fieldStaff}
          onClose={() => setEditOpen(false)}
        />
      )}
      {scopeOpen && (
        <EditScopeModal visit={visit} onClose={() => setScopeOpen(false)} />
      )}
      {confirmDelete && (
        <DeleteVisitModal
          visit={visit}
          onClose={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}

function VisitStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; classes: string }> = {
    scheduled: { label: 'Scheduled', classes: 'bg-blue-50 text-blue-700' },
    in_progress: { label: 'In progress', classes: 'bg-amber-50 text-amber-700' },
    completed: { label: 'Completed', classes: 'bg-emerald-50 text-emerald-700' },
    cancelled: { label: 'Cancelled', classes: 'bg-gray-100 text-gray-500' },
  };
  const tone = map[status] ?? { label: status, classes: 'bg-gray-100 text-gray-600' };
  return (
    <span
      className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', tone.classes)}
    >
      {tone.label}
    </span>
  );
}

function EditVisitModal({
  plan,
  visit,
  vendors,
  fieldStaff,
  onClose,
}: {
  plan: PlanDetail;
  visit: VisitWithScope;
  vendors: VendorPickerRow[];
  fieldStaff: FieldStaffPickerRow[];
  onClose: () => void;
}) {
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState(visit.title);
  const [scheduledDate, setScheduledDate] = useState(visit.scheduledDate);
  const [vendorId, setVendorId] = useState(visit.vendorId ?? '');
  const [staffId, setStaffId] = useState(visit.assignedFieldStaffId ?? '');
  const [notes, setNotes] = useState(visit.notes ?? '');

  void plan;

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await updateVisit(visit.id, {
        title,
        scheduledDate,
        vendorId: vendorId || null,
        assignedFieldStaffId: staffId || null,
        notes,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      showToast('Visit updated', 'success');
      onClose();
    });
  }

  return (
    <Modal open onClose={onClose} locked={pending} title="Edit visit" size="md">
      <div className="space-y-4">
        {error && (
          <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}
        <Field label="Title" required>
          <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Scheduled date" required>
          <input
            type="date"
            className={inputClass}
            value={scheduledDate}
            onChange={(e) => setScheduledDate(e.target.value)}
          />
        </Field>
        <Field label="Primary vendor">
          <select
            className={inputClass}
            value={vendorId}
            onChange={(e) => setVendorId(e.target.value)}
          >
            <option value="">— None —</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name} ({v.category})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Assigned field staff">
          <select
            className={inputClass}
            value={staffId}
            onChange={(e) => setStaffId(e.target.value)}
          >
            <option value="">— None —</option>
            {fieldStaff.map((s) => (
              <option key={s.profileId} value={s.profileId}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Notes">
          <textarea
            className={textareaClass}
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>
      </div>
      <div className="mt-6 flex justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          disabled={pending}
          className="rounded-xl px-4 py-2.5 text-sm font-medium text-ink-700 hover:bg-cream disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="bg-brand-gold-400 hover:bg-brand-gold-500 shadow-soft rounded-xl px-5 py-2.5 text-sm font-medium text-white transition-all disabled:opacity-50"
        >
          {pending ? <>Saving<LoadingDots /></> : 'Save changes'}
        </button>
      </div>
    </Modal>
  );
}

function EditScopeModal({
  visit,
  onClose,
}: {
  visit: VisitWithScope;
  onClose: () => void;
}) {
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [items, setItems] = useState<{ scopeType: string; customLabel: string }[]>(() =>
    visit.scopeItems.map((s) => ({ scopeType: s.scopeType, customLabel: s.customLabel ?? '' })),
  );

  function toggle(scopeType: string) {
    setItems((prev) =>
      prev.some((s) => s.scopeType === scopeType)
        ? prev.filter((s) => s.scopeType !== scopeType)
        : [...prev, { scopeType, customLabel: '' }],
    );
  }

  function save() {
    setError(null);
    for (const i of items) {
      if (i.scopeType === 'custom' && !i.customLabel.trim()) {
        setError('Custom items need a label.');
        return;
      }
    }
    const payload: ScopeItemInput[] = items.map((s) => ({
      scopeType: s.scopeType,
      customLabel: s.scopeType === 'custom' ? s.customLabel.trim() : null,
    }));
    startTransition(async () => {
      const result = await setVisitScope(visit.id, payload);
      if (!result.success) {
        setError(result.error);
        return;
      }
      showToast('Scope updated', 'success');
      onClose();
    });
  }

  return (
    <Modal open onClose={onClose} locked={pending} title={`Scope for ${visit.title}`} size="md">
      {error && (
        <div className="mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {SCOPE_TYPES.map((s) => {
          const Icon = s.icon;
          const active = items.some((it) => it.scopeType === s.value);
          return (
            <button
              key={s.value}
              type="button"
              onClick={() => toggle(s.value)}
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
      {items.some((it) => it.scopeType === 'custom') && (
        <div className="mt-4">
          <Field label="Custom item label" required>
            <input
              className={inputClass}
              value={items.find((it) => it.scopeType === 'custom')?.customLabel ?? ''}
              onChange={(e) =>
                setItems((prev) =>
                  prev.map((it) =>
                    it.scopeType === 'custom' ? { ...it, customLabel: e.target.value } : it,
                  ),
                )
              }
            />
          </Field>
        </div>
      )}
      <div className="mt-6 flex justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          disabled={pending}
          className="rounded-xl px-4 py-2.5 text-sm font-medium text-ink-700 hover:bg-cream disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="bg-brand-gold-400 hover:bg-brand-gold-500 shadow-soft rounded-xl px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? <>Saving<LoadingDots /></> : 'Save scope'}
        </button>
      </div>
    </Modal>
  );
}

function DeleteVisitModal({
  visit,
  onClose,
}: {
  visit: VisitWithScope;
  onClose: () => void;
}) {
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function confirm() {
    setError(null);
    startTransition(async () => {
      const result = await deleteVisit(visit.id);
      if (!result.success) {
        setError(result.error);
        return;
      }
      showToast('Visit deleted', 'success');
      onClose();
    });
  }

  return (
    <Modal open onClose={onClose} locked={pending} title="Delete this visit?" size="sm">
      <p className="text-sm text-ink-700">
        Removes the visit, its scope items, and the calendar appointment that backs it. This
        can&rsquo;t be undone. Visits with already-completed scope items can&rsquo;t be deleted —
        cancel them instead.
      </p>
      {error && (
        <div className="mt-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}
      <div className="mt-6 flex justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          disabled={pending}
          className="rounded-xl px-4 py-2.5 text-sm font-medium text-ink-700 hover:bg-cream disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={confirm}
          disabled={pending}
          className="shadow-soft rounded-xl bg-red-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50"
        >
          {pending ? <>Deleting<LoadingDots /></> : 'Delete visit'}
        </button>
      </div>
    </Modal>
  );
}

function AddVisitModal({
  plan,
  vendors,
  fieldStaff,
  onClose,
}: {
  plan: PlanDetail;
  vendors: VendorPickerRow[];
  fieldStaff: FieldStaffPickerRow[];
  onClose: () => void;
}) {
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [scheduledDate, setScheduledDate] = useState(plan.startDate);
  const [vendorId, setVendorId] = useState('');
  const [staffId, setStaffId] = useState('');
  const [notes, setNotes] = useState('');
  const [scopeTypes, setScopeTypes] = useState<string[]>(['hvac']);

  function toggleScope(type: string) {
    setScopeTypes((prev) =>
      prev.includes(type) ? prev.filter((s) => s !== type) : [...prev, type],
    );
  }

  function submit() {
    setError(null);
    if (!title.trim()) {
      setError('Title is required.');
      return;
    }
    if (!scheduledDate) {
      setError('Date is required.');
      return;
    }
    startTransition(async () => {
      const result = await addVisit(plan.id, {
        title: title.trim(),
        scheduledDate,
        vendorId: vendorId || null,
        assignedFieldStaffId: staffId || null,
        notes: notes.trim() || null,
        isAdHoc: true,
        scopeItems: scopeTypes.map((t) => ({ scopeType: t })),
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      showToast('Visit added', 'success');
      onClose();
    });
  }

  return (
    <Modal open onClose={onClose} locked={pending} title="Add ad-hoc visit" size="md">
      <div className="space-y-4">
        {error && (
          <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}
        <Field label="Title" required>
          <input
            className={inputClass}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Emergency HVAC service"
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Scheduled date" required>
            <input
              type="date"
              className={inputClass}
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
              min={plan.startDate}
              max={plan.endDate}
            />
          </Field>
          <Field label="Primary vendor">
            <select
              className={inputClass}
              value={vendorId}
              onChange={(e) => setVendorId(e.target.value)}
            >
              <option value="">— None —</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Assigned field staff">
          <select
            className={inputClass}
            value={staffId}
            onChange={(e) => setStaffId(e.target.value)}
          >
            <option value="">— None —</option>
            {fieldStaff.map((s) => (
              <option key={s.profileId} value={s.profileId}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Scope">
          <div className="flex flex-wrap gap-2">
            {SCOPE_TYPES.filter((s) => s.value !== 'custom').map((s) => {
              const Icon = s.icon;
              const active = scopeTypes.includes(s.value);
              return (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => toggleScope(s.value)}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-all',
                    active
                      ? 'border-brand-teal-500/30 bg-brand-teal-50 text-brand-teal-500'
                      : 'border-line bg-paper text-ink-500 hover:border-brand-teal-300 hover:text-brand-teal-500',
                  )}
                >
                  <Icon size={12} strokeWidth={1.5} />
                  {s.label}
                </button>
              );
            })}
          </div>
        </Field>
        <Field label="Notes">
          <textarea
            className={textareaClass}
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>
      </div>
      <div className="mt-6 flex justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          disabled={pending}
          className="rounded-xl px-4 py-2.5 text-sm font-medium text-ink-700 hover:bg-cream disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="bg-brand-gold-400 hover:bg-brand-gold-500 shadow-soft rounded-xl px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? <>Adding<LoadingDots /></> : 'Add visit'}
        </button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Documents tab
// ---------------------------------------------------------------------------

function DocumentsTab({
  plan,
  signedHomeAssessmentUrl,
  signedPlaybookUrl,
}: {
  plan: PlanDetail;
  signedHomeAssessmentUrl: string | null;
  signedPlaybookUrl: string | null;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <DocCard
        title="Home assessment"
        description="One-page summary of the property's mechanical systems."
        planId={plan.id}
        kind="home_assessment"
        signedUrl={signedHomeAssessmentUrl}
      />
      <DocCard
        title="Playbook"
        description="Operating procedures for field staff servicing this property."
        planId={plan.id}
        kind="playbook"
        signedUrl={signedPlaybookUrl}
      />
    </div>
  );
}

function DocCard({
  title,
  description,
  planId,
  kind,
  signedUrl,
}: {
  title: string;
  description: string;
  planId: string;
  kind: 'home_assessment' | 'playbook';
  signedUrl: string | null;
}) {
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onPicked(file: File) {
    setError(null);
    if (file.type !== 'application/pdf') {
      setError('PDF only.');
      return;
    }
    const formData = new FormData();
    formData.append('file', file);
    startTransition(async () => {
      const result = await uploadPlanDocument(planId, kind, formData);
      if (!result.success) {
        setError(result.error);
        return;
      }
      showToast('Document uploaded', 'success');
    });
  }

  const id = `doc-${kind}`;

  return (
    <div className="shadow-soft-md rounded-2xl bg-paper p-5">
      <div className="mb-3">
        <h3 className="text-base font-semibold text-ink-900">{title}</h3>
        <p className="mt-1 text-xs text-ink-500">{description}</p>
      </div>
      {error && (
        <div className="mb-3 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-600">
          {error}
        </div>
      )}
      {signedUrl ? (
        <div className="space-y-2">
          <a
            href={signedUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-xl border border-brand-teal-200 bg-brand-teal-50 px-3 py-2 text-sm font-medium text-brand-teal-500 hover:border-brand-teal-300"
          >
            <Download size={14} strokeWidth={1.5} />
            Download
          </a>
          <label
            htmlFor={id}
            className={cn(
              'flex cursor-pointer items-center gap-2 rounded-xl border border-line bg-cream px-3 py-2 text-xs font-medium text-ink-700 transition-colors hover:bg-paper',
              pending && 'opacity-50',
            )}
          >
            <Upload size={12} strokeWidth={1.5} />
            {pending ? 'Replacing…' : 'Replace PDF'}
            <input
              id={id}
              type="file"
              accept="application/pdf"
              className="sr-only"
              disabled={pending}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onPicked(file);
              }}
            />
          </label>
        </div>
      ) : (
        <label
          htmlFor={id}
          className={cn(
            'flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line bg-cream py-6 text-sm font-medium text-ink-500 transition-colors hover:border-brand-teal-300 hover:text-brand-teal-500',
            pending && 'opacity-50',
          )}
        >
          <Upload size={14} strokeWidth={1.5} />
          {pending ? 'Uploading…' : 'Upload PDF'}
          <input
            id={id}
            type="file"
            accept="application/pdf"
            className="sr-only"
            disabled={pending}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onPicked(file);
            }}
          />
        </label>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// History tab
// ---------------------------------------------------------------------------

function HistoryTab({ history }: { history: PlanAuditEntry[] }) {
  if (history.length === 0) {
    return (
      <div className="shadow-soft-md rounded-2xl bg-paper p-12 text-center">
        <div className="bg-cream mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full text-ink-400">
          <History size={20} strokeWidth={1.5} />
        </div>
        <h2 className="text-ink-900 text-base font-semibold">No history yet</h2>
        <p className="text-ink-500 mx-auto mt-2 max-w-sm text-sm">
          Edits to the plan, visits, and scope items will appear here as they happen.
        </p>
      </div>
    );
  }

  return (
    <div className="shadow-soft-md rounded-2xl bg-paper p-5">
      <ol className="divide-y divide-line-2">
        {history.map((entry) => (
          <li key={entry.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
            <span className="mt-1.5 inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand-gold-400" />
            <div className="min-w-0 flex-1">
              <div className="text-sm text-ink-900">
                <span className="font-medium">{entry.actorName ?? 'Someone'}</span>{' '}
                <span className="text-ink-500">{entry.action}</span>{' '}
                <span className="font-medium">{entry.targetLabel}</span>
              </div>
              <div className="text-[11px] text-ink-400">
                {entry.createdAt.toLocaleString()}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
