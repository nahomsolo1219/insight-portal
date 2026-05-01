'use client';

import {
  AlertCircle,
  Check,
  Clock,
  HelpCircle,
  Pencil,
  Plus,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useOptimistic, useState, useTransition } from 'react';
import { Field, inputClass, textareaClass } from '@/components/admin/Field';
import { LoadingDots } from '@/components/admin/LoadingDots';
import { Modal } from '@/components/admin/Modal';
import { useToast } from '@/components/admin/ToastProvider';
import { toggleMilestoneComplete } from '@/app/admin/clients/[id]/actions';
import { cn, formatShortDate } from '@/lib/utils';
import {
  addMilestone,
  deleteMilestone,
  markDecisionAwaitingClient,
  updateMilestone,
  type UpdateMilestoneInput,
} from './actions';
import type { AdminDecisionOption } from '@/lib/decision-options';
import type { ProjectMilestoneRow, VendorOption } from './queries';

interface Props {
  projectId: string;
  clientId: string;
  milestones: ProjectMilestoneRow[];
  vendors: VendorOption[];
}

type Status = ProjectMilestoneRow['status'];

export function MilestonesTabClient({ projectId, clientId, milestones, vendors }: Props) {
  const router = useRouter();
  const { showToast } = useToast();
  const [, startTransition] = useTransition();
  const [addOpen, setAddOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Optimistic toggle layer — same pattern the existing inline checklist
  // uses on the client detail Projects tab.
  const [optimistic, applyOptimistic] = useOptimistic(
    milestones,
    (state, action: { milestoneId: string; newStatus: Status }) =>
      state.map((m) =>
        m.id === action.milestoneId ? { ...m, status: action.newStatus } : m,
      ),
  );

  // Group milestones by category. Falls back to "General" so milestones
  // without a category don't disappear.
  const grouped = useMemo(() => {
    const map = new Map<string, ProjectMilestoneRow[]>();
    for (const m of optimistic) {
      const key = m.category?.trim() || 'General';
      const existing = map.get(key);
      if (existing) existing.push(m);
      else map.set(key, [m]);
    }
    return Array.from(map.entries());
  }, [optimistic]);

  function handleToggle(milestoneId: string, currentStatus: Status) {
    if (currentStatus === 'awaiting_client') return;
    const newStatus: Status = currentStatus === 'complete' ? 'pending' : 'complete';
    startTransition(async () => {
      applyOptimistic({ milestoneId, newStatus });
      const result = await toggleMilestoneComplete(milestoneId, clientId);
      if (!result.success) {
        showToast(result.error, 'error');
        return;
      }
      router.refresh();
    });
  }

  function handleSendDecision(milestoneId: string) {
    startTransition(async () => {
      const result = await markDecisionAwaitingClient(milestoneId, projectId);
      if (!result.success) {
        showToast(result.error, 'error');
        return;
      }
      showToast('Decision sent to client');
      router.refresh();
    });
  }

  function handleDelete(milestoneId: string) {
    startTransition(async () => {
      const result = await deleteMilestone(milestoneId, projectId);
      if (!result.success) {
        showToast(result.error, 'error');
        return;
      }
      showToast('Milestone deleted');
      setDeletingId(null);
      router.refresh();
    });
  }

  const editingMilestone = editingId
    ? optimistic.find((m) => m.id === editingId) ?? null
    : null;
  const deletingMilestone = deletingId
    ? optimistic.find((m) => m.id === deletingId) ?? null
    : null;

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-xs font-semibold tracking-wider text-gray-500 uppercase">
          Milestones
        </h2>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="bg-brand-gold-400 hover:bg-brand-gold-500 shadow-soft inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-white transition-all"
        >
          <Plus size={14} strokeWidth={2} />
          Add milestone
        </button>
      </div>

      {grouped.length === 0 ? (
        <div className="shadow-soft-md rounded-2xl bg-paper p-8 text-center text-sm text-gray-400">
          No milestones yet. Add one to start tracking work.
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(([category, items]) => (
            <section key={category}>
              <h3 className="mb-2 text-[11px] font-semibold tracking-wider text-gray-400 uppercase">
                {category}
              </h3>
              <div className="shadow-soft-md overflow-hidden rounded-2xl bg-paper">
                {items.map((m, i) => (
                  <MilestoneRow
                    key={m.id}
                    milestone={m}
                    isLast={i === items.length - 1}
                    onToggle={(status) => handleToggle(m.id, status)}
                    onEdit={() => setEditingId(m.id)}
                    onDelete={() => setDeletingId(m.id)}
                    onSendDecision={() => handleSendDecision(m.id)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {addOpen && (
        <AddMilestoneModal
          projectId={projectId}
          vendors={vendors}
          onClose={() => setAddOpen(false)}
        />
      )}

      {editingMilestone && (
        <EditMilestoneModal
          projectId={projectId}
          milestone={editingMilestone}
          vendors={vendors}
          onClose={() => setEditingId(null)}
        />
      )}

      {deletingMilestone && (
        <DeleteConfirmModal
          milestone={deletingMilestone}
          onClose={() => setDeletingId(null)}
          onConfirm={() => handleDelete(deletingMilestone.id)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

interface MilestoneRowProps {
  milestone: ProjectMilestoneRow;
  isLast: boolean;
  onToggle: (status: Status) => void;
  onEdit: () => void;
  onDelete: () => void;
  onSendDecision: () => void;
}

function MilestoneRow({
  milestone,
  isLast,
  onToggle,
  onEdit,
  onDelete,
  onSendDecision,
}: MilestoneRowProps) {
  const isComplete = milestone.status === 'complete';
  const isAwaiting = milestone.status === 'awaiting_client';
  const isInProgress = milestone.status === 'in_progress';
  const isDecision = Boolean(milestone.questionType);
  const canSendDecision = isDecision && !isAwaiting && !isComplete;
  // `milestone.options` arrives pre-parsed + URL-hydrated from the
  // server query; nothing to do at the client. Empty array when the row
  // never had options.
  const options = milestone.options;

  const metaParts = [
    milestone.dueDate ? `Due ${formatShortDate(milestone.dueDate)}` : null,
    milestone.vendorName,
  ].filter(Boolean);

  return (
    <div
      className={cn(
        'group flex items-start gap-3 px-5 py-4 transition-colors',
        !isLast && 'border-b border-gray-50',
        'hover:bg-brand-warm-50',
      )}
    >
      <button
        type="button"
        onClick={() => onToggle(milestone.status)}
        disabled={isAwaiting}
        aria-label={isComplete ? 'Mark incomplete' : 'Mark complete'}
        title={isAwaiting ? 'Waiting on client response' : 'Toggle complete'}
        className={cn(
          'mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 transition-all',
          isComplete
            ? 'border-emerald-500 bg-emerald-500'
            : isAwaiting
              ? 'cursor-not-allowed border-pink-300'
              : 'hover:border-brand-teal-500 cursor-pointer border-gray-300',
        )}
      >
        {isComplete && <Check size={12} strokeWidth={3} className="text-white" />}
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h4
            className={cn(
              'text-sm font-medium',
              isComplete ? 'text-gray-400 line-through' : 'text-gray-900',
            )}
          >
            {milestone.title}
          </h4>
          {isDecision && <DecisionBadge />}
          {isAwaiting && <AwaitingBadge />}
          {isInProgress && <InProgressBadge />}
        </div>

        {metaParts.length > 0 && (
          <div className="mt-0.5 text-xs text-gray-500">{metaParts.join(' · ')}</div>
        )}

        {milestone.notes && (
          <p className="mt-1.5 text-xs whitespace-pre-wrap text-gray-600">
            {milestone.notes}
          </p>
        )}

        {isDecision && (
          <DecisionDetails
            questionBody={milestone.questionBody}
            options={options}
            response={milestone.clientResponse}
          />
        )}
      </div>

      <div className="flex flex-shrink-0 items-start gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        {canSendDecision && (
          <button
            type="button"
            onClick={onSendDecision}
            title="Send decision to client"
            aria-label="Send decision to client"
            className="text-brand-teal-500 hover:bg-brand-teal-50 inline-flex h-7 w-7 items-center justify-center rounded-lg transition-colors"
          >
            <Send size={13} strokeWidth={1.75} />
          </button>
        )}
        <button
          type="button"
          onClick={onEdit}
          title="Edit milestone"
          aria-label="Edit milestone"
          className="hover:bg-cream inline-flex h-7 w-7 items-center justify-center rounded-lg text-gray-500 transition-colors hover:text-gray-700"
        >
          <Pencil size={13} strokeWidth={1.5} />
        </button>
        <button
          type="button"
          onClick={onDelete}
          title="Delete milestone"
          aria-label="Delete milestone"
          className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-red-400 transition-colors hover:bg-red-50 hover:text-red-600"
        >
          <Trash2 size={13} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}

function DecisionDetails({
  questionBody,
  options,
  response,
}: {
  questionBody: string | null;
  options: AdminDecisionOption[];
  response: string | null;
}) {
  // Match the response back to a specific option so we can render that
  // option's image alongside the response label. Open-text / approval /
  // acknowledge responses don't match any option — fall back to plain
  // text.
  const chosen = response ? options.find((o) => o.label === response) ?? null : null;
  const hasOptions = options.length > 0;

  return (
    <div className="mt-2 space-y-2 rounded-lg bg-gray-50 px-3 py-2 text-xs">
      {questionBody && <p className="text-gray-700">{questionBody}</p>}

      {hasOptions && (
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {options.map((opt, i) => {
            const isChosen = chosen?.label === opt.label;
            return (
              <div
                key={`opt-${i}`}
                className={cn(
                  'flex items-stretch gap-2 overflow-hidden rounded-md border bg-paper px-2 py-1.5',
                  isChosen ? 'border-emerald-300 bg-emerald-50' : 'border-line-2',
                )}
              >
                {opt.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={opt.imageUrl}
                    alt={opt.label}
                    className="h-12 w-12 flex-shrink-0 rounded object-cover"
                    loading="lazy"
                  />
                ) : null}
                <div className="flex min-w-0 flex-1 flex-col justify-center">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-medium text-gray-400">
                      {String.fromCharCode(65 + i)}
                    </span>
                    <span className="truncate text-xs font-medium text-gray-900">
                      {opt.label}
                    </span>
                    {isChosen && (
                      <span className="text-[9px] font-semibold tracking-wider text-emerald-700 uppercase">
                        Chose
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-gray-500">
        Client response:{' '}
        {response ? (
          <span className="font-medium text-gray-900">{response}</span>
        ) : (
          <span className="italic text-gray-400">none yet</span>
        )}
      </p>
    </div>
  );
}

function DecisionBadge() {
  return (
    <span className="bg-brand-gold-50 text-brand-gold-700 inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase">
      <HelpCircle size={9} strokeWidth={2.5} />
      Decision
    </span>
  );
}
function AwaitingBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-pink-50 px-2 py-0.5 text-[10px] font-semibold tracking-wider text-pink-700 uppercase">
      <AlertCircle size={9} strokeWidth={2.5} />
      Awaiting client
    </span>
  );
}
function InProgressBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-[10px] font-semibold tracking-wider text-blue-700 uppercase">
      <Clock size={9} strokeWidth={2.5} />
      In progress
    </span>
  );
}

// ---------------------------------------------------------------------------
// Add modal
// ---------------------------------------------------------------------------

interface FormState {
  title: string;
  category: string;
  dueDate: string;
  notes: string;
  vendorId: string;
}

function blankForm(): FormState {
  return { title: '', category: '', dueDate: '', notes: '', vendorId: '' };
}

function AddMilestoneModal({
  projectId,
  vendors,
  onClose,
}: {
  projectId: string;
  vendors: VendorOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(blankForm);

  function submit() {
    setError(null);
    if (!form.title.trim()) {
      setError('Title is required.');
      return;
    }
    startTransition(async () => {
      const result = await addMilestone(projectId, {
        title: form.title,
        category: form.category || null,
        dueDate: form.dueDate || null,
        notes: form.notes || null,
        vendorId: form.vendorId || null,
      });
      if (!result.success) {
        setError(result.error);
        showToast(result.error, 'error');
        return;
      }
      showToast('Milestone added');
      onClose();
      router.refresh();
    });
  }

  return (
    <MilestoneFormModal
      title="Add milestone"
      submitLabel="Add"
      submittingLabel="Adding"
      form={form}
      setForm={setForm}
      vendors={vendors}
      error={error}
      isPending={isPending}
      onClose={onClose}
      onSubmit={submit}
    />
  );
}

function EditMilestoneModal({
  projectId,
  milestone,
  vendors,
  onClose,
}: {
  projectId: string;
  milestone: ProjectMilestoneRow;
  vendors: VendorOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => ({
    title: milestone.title,
    category: milestone.category ?? '',
    dueDate: milestone.dueDate ?? '',
    notes: milestone.notes ?? '',
    vendorId: milestone.vendorId ?? '',
  }));

  function submit() {
    setError(null);
    if (!form.title.trim()) {
      setError('Title cannot be empty.');
      return;
    }
    const patch: UpdateMilestoneInput = {
      title: form.title,
      category: form.category || null,
      dueDate: form.dueDate || null,
      notes: form.notes || null,
      vendorId: form.vendorId || null,
    };
    startTransition(async () => {
      const result = await updateMilestone(milestone.id, projectId, patch);
      if (!result.success) {
        setError(result.error);
        showToast(result.error, 'error');
        return;
      }
      showToast('Milestone updated');
      onClose();
      router.refresh();
    });
  }

  return (
    <MilestoneFormModal
      title="Edit milestone"
      submitLabel="Save"
      submittingLabel="Saving"
      form={form}
      setForm={setForm}
      vendors={vendors}
      error={error}
      isPending={isPending}
      onClose={onClose}
      onSubmit={submit}
    />
  );
}

interface MilestoneFormModalProps {
  title: string;
  submitLabel: string;
  submittingLabel: string;
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  vendors: VendorOption[];
  error: string | null;
  isPending: boolean;
  onClose: () => void;
  onSubmit: () => void;
}

function MilestoneFormModal({
  title,
  submitLabel,
  submittingLabel,
  form,
  setForm,
  vendors,
  error,
  isPending,
  onClose,
  onSubmit,
}: MilestoneFormModalProps) {
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
            {isPending ? (
              <>
                {submittingLabel}
                <LoadingDots />
              </>
            ) : (
              submitLabel
            )}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Title" required>
          <input
            type="text"
            value={form.title}
            onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
            placeholder="e.g. Electrical rough-in"
            className={inputClass}
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Category" hint="e.g. Electrical">
            <input
              type="text"
              value={form.category}
              onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
              className={inputClass}
            />
          </Field>
          <Field label="Due date">
            <input
              type="date"
              value={form.dueDate}
              onChange={(e) => setForm((prev) => ({ ...prev, dueDate: e.target.value }))}
              className={inputClass}
            />
          </Field>
        </div>
        <Field label="Vendor">
          <select
            value={form.vendorId}
            onChange={(e) => setForm((prev) => ({ ...prev, vendorId: e.target.value }))}
            className={inputClass}
          >
            <option value="">— None —</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name} · {v.category}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Notes" hint="Internal — not shown to clients.">
          <textarea
            value={form.notes}
            onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
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

function DeleteConfirmModal({
  milestone,
  onClose,
  onConfirm,
}: {
  milestone: ProjectMilestoneRow;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      open
      onClose={onClose}
      title="Delete milestone?"
      size="sm"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="bg-paper border border-line text-ink-700 hover:bg-cream rounded-lg px-4 py-2.5 font-medium transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="bg-rose-600 hover:bg-rose-700 text-paper inline-flex items-center gap-1.5 rounded-lg px-4 py-2.5 font-medium transition"
          >
            <X size={14} strokeWidth={2} />
            Delete
          </button>
        </>
      }
    >
      <p className="text-sm text-gray-700">
        Permanently delete{' '}
        <strong className="font-semibold">{milestone.title}</strong>? Any photos or
        appointments linked to it will be unlinked but kept. This cannot be undone.
      </p>
    </Modal>
  );
}
