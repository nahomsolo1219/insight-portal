'use client';

import { AlertTriangle, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Field, inputClass, textareaClass } from '@/components/admin/Field';
import { LoadingDots } from '@/components/admin/LoadingDots';
import { Modal } from '@/components/admin/Modal';
import { useToast } from '@/components/admin/ToastProvider';
import { cn } from '@/lib/utils';
import { deleteProject, updateProject, type ProjectStatus } from './actions';
import type { ProjectDetailRow } from './queries';

interface Props {
  project: ProjectDetailRow;
}

interface FormState {
  name: string;
  type: 'maintenance' | 'remodel';
  status: ProjectStatus;
  startDate: string;
  endDate: string;
  description: string;
  contractDollars: string;
  changesDollars: string;
  paidDollars: string;
}

function projectToForm(project: ProjectDetailRow): FormState {
  return {
    name: project.name,
    type: project.type,
    status: project.status,
    startDate: project.startDate ?? '',
    endDate: project.endDate ?? '',
    description: project.description ?? '',
    contractDollars: project.contractCents !== null ? centsToDollarsString(project.contractCents) : '',
    changesDollars: centsToDollarsString(project.changesCents),
    paidDollars: centsToDollarsString(project.paidCents),
  };
}

export function DetailsTabClient({ project }: Props) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => projectToForm(project));
  const [deleteOpen, setDeleteOpen] = useState(false);

  const isRemodel = form.type === 'remodel';
  const isDirty = JSON.stringify(form) !== JSON.stringify(projectToForm(project));

  function patch<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError(null);
  }

  function save() {
    setError(null);
    if (!form.name.trim()) {
      setError('Project name cannot be empty.');
      return;
    }
    const contractCents = isRemodel ? dollarsToCents(form.contractDollars) : null;
    const changesCents = isRemodel ? dollarsToCents(form.changesDollars) ?? 0 : 0;
    const paidCents = isRemodel ? dollarsToCents(form.paidDollars) ?? 0 : 0;
    if (
      isRemodel &&
      (contractCents === undefined || changesCents === undefined || paidCents === undefined)
    ) {
      setError('Budget values must be valid numbers.');
      return;
    }

    startTransition(async () => {
      const result = await updateProject(project.id, {
        name: form.name,
        type: form.type,
        status: form.status,
        startDate: form.startDate || null,
        endDate: form.endDate || null,
        description: form.description || null,
        contractCents: isRemodel ? contractCents ?? null : null,
        changesCents: isRemodel ? changesCents ?? 0 : 0,
        paidCents: isRemodel ? paidCents ?? 0 : 0,
      });
      if (!result.success) {
        setError(result.error);
        showToast(result.error, 'error');
        return;
      }
      showToast('Project updated');
      router.refresh();
    });
  }

  return (
    <div className="space-y-8">
      <section className="shadow-card rounded-2xl bg-white p-6">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Project information</h2>
          <button
            type="button"
            onClick={save}
            disabled={isPending || !isDirty}
            className="bg-brand-gold-400 hover:bg-brand-gold-500 shadow-soft inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-white transition-all disabled:cursor-not-allowed disabled:opacity-50"
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
        </div>

        <div className="space-y-5">
          <Field label="Project name" required>
            <input
              type="text"
              value={form.name}
              onChange={(e) => patch('name', e.target.value)}
              className={inputClass}
            />
          </Field>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <Field label="Type">
              <select
                value={form.type}
                onChange={(e) => patch('type', e.target.value as FormState['type'])}
                className={inputClass}
              >
                <option value="maintenance">Maintenance</option>
                <option value="remodel">Remodel</option>
              </select>
            </Field>
            <Field label="Status">
              <select
                value={form.status}
                onChange={(e) => patch('status', e.target.value as ProjectStatus)}
                className={inputClass}
              >
                <option value="active">Active</option>
                <option value="on_hold">On hold</option>
                <option value="completed">Completed</option>
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <Field label="Start date">
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => patch('startDate', e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Estimated completion">
              <input
                type="date"
                value={form.endDate}
                onChange={(e) => patch('endDate', e.target.value)}
                className={inputClass}
              />
            </Field>
          </div>

          <Field label="Description" hint="Visible to the client on the portal.">
            <textarea
              value={form.description}
              onChange={(e) => patch('description', e.target.value)}
              rows={4}
              className={textareaClass}
            />
          </Field>
        </div>
      </section>

      {isRemodel && (
        <section className="shadow-card rounded-2xl bg-white p-6">
          <h2 className="mb-5 text-base font-semibold text-gray-900">Budget</h2>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            <Field label="Contract amount" hint="Total signed contract.">
              <DollarsInput
                value={form.contractDollars}
                onChange={(v) => patch('contractDollars', v)}
              />
            </Field>
            <Field label="Change orders" hint="Approved changes since signing.">
              <DollarsInput
                value={form.changesDollars}
                onChange={(v) => patch('changesDollars', v)}
              />
            </Field>
            <Field label="Amount paid" hint="Sum of payments received.">
              <DollarsInput
                value={form.paidDollars}
                onChange={(v) => patch('paidDollars', v)}
              />
            </Field>
          </div>
        </section>
      )}

      {error && (
        <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      <section className="rounded-2xl border border-red-200 bg-red-50/40 p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle size={18} strokeWidth={1.5} className="mt-0.5 flex-shrink-0 text-red-500" />
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-red-700">Danger zone</h2>
            <p className="mt-1 text-sm text-gray-700">
              Deleting a project removes its milestones, photos, reports, and appointments.
              This cannot be undone.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setDeleteOpen(true)}
            className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-xl bg-red-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600"
          >
            <Trash2 size={14} strokeWidth={1.75} />
            Delete project
          </button>
        </div>
      </section>

      {deleteOpen && (
        <DeleteProjectModal project={project} onClose={() => setDeleteOpen(false)} />
      )}
    </div>
  );
}

function DollarsInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative">
      <span className="absolute top-1/2 left-3 -translate-y-1/2 text-sm text-gray-400">$</span>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0.00"
        className={cn(inputClass, 'pl-7 tabular-nums')}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Delete confirm modal — requires typing the exact project name
// ---------------------------------------------------------------------------

function DeleteProjectModal({
  project,
  onClose,
}: {
  project: ProjectDetailRow;
  onClose: () => void;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [confirm, setConfirm] = useState('');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const matches = confirm === project.name;

  function submit() {
    setError(null);
    if (!matches) return;
    startTransition(async () => {
      const result = await deleteProject(project.id, confirm);
      if (!result.success) {
        setError(result.error);
        showToast(result.error, 'error');
        return;
      }
      showToast('Project deleted');
      router.push(`/admin/clients/${project.clientId}`);
      router.refresh();
    });
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Delete project?"
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
            onClick={submit}
            disabled={!matches || isPending}
            className="shadow-soft inline-flex items-center gap-1.5 rounded-xl bg-red-500 px-5 py-2.5 font-medium text-white transition-all hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? (
              <>
                Deleting
                <LoadingDots />
              </>
            ) : (
              <>
                <Trash2 size={14} strokeWidth={1.75} />
                Delete project
              </>
            )}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-700">
          This will permanently delete{' '}
          <strong className="font-semibold">{project.name}</strong> and every milestone,
          photo, report, and appointment attached to it. The client will lose this
          history on their portal.
        </p>
        <Field
          label="Type the project name to confirm"
          hint={`Type "${project.name}" exactly to enable the Delete button.`}
          required
        >
          <input
            type="text"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoFocus
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
// $ ↔ cents helpers
// ---------------------------------------------------------------------------

function centsToDollarsString(cents: number): string {
  return (cents / 100).toFixed(2);
}

/**
 * Parse a "$1,234.56" or "1234.56" or "" string into integer cents. Returns
 * `undefined` when the input is non-numeric so callers can surface a
 * validation error instead of writing garbage to the DB.
 */
function dollarsToCents(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return 0;
  const cleaned = trimmed.replace(/[$,]/g, '');
  const parsed = Number.parseFloat(cleaned);
  if (!Number.isFinite(parsed) || parsed < 0) return undefined;
  return Math.round(parsed * 100);
}
