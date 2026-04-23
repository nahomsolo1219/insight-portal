'use client';

import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  FolderPlus,
  ListChecks,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Field, inputClass } from '@/components/admin/Field';
import { Modal } from '@/components/admin/Modal';
import { cn } from '@/lib/utils';
import {
  createTemplate,
  deleteTemplate,
  updateTemplate,
  type ProjectTemplateType,
  type TemplateMilestoneInput,
} from './actions';
import type { TemplateListRow, TemplateMilestoneRow } from './queries';

interface TemplatesClientProps {
  templates: TemplateListRow[];
  milestonesByTemplate: Record<string, TemplateMilestoneRow[]>;
}

export function TemplatesClient({ templates, milestonesByTemplate }: TemplatesClientProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<TemplateListRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TemplateListRow | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div>
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="text-sm text-gray-500">
          {templates.length} {templates.length === 1 ? 'template' : 'templates'}
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="bg-brand-gold-400 hover:bg-brand-gold-500 shadow-soft inline-flex items-center gap-2 rounded-xl px-5 py-2.5 font-medium text-white transition-all duration-150"
        >
          <Plus size={16} strokeWidth={2} />
          New template
        </button>
      </div>

      {templates.length === 0 ? (
        <EmptyState onCreate={() => setCreateOpen(true)} />
      ) : (
        <div className="space-y-3">
          {templates.map((t) => (
            <TemplateCard
              key={t.id}
              template={t}
              milestones={milestonesByTemplate[t.id] ?? []}
              expanded={expanded.has(t.id)}
              onToggle={() => toggleExpand(t.id)}
              onEdit={() => setEditTarget(t)}
              onDelete={() => setDeleteTarget(t)}
            />
          ))}
        </div>
      )}

      {createOpen && <CreateTemplateModal onClose={() => setCreateOpen(false)} />}
      {editTarget && (
        <EditTemplateModal
          template={editTarget}
          initialMilestones={milestonesByTemplate[editTarget.id] ?? []}
          onClose={() => setEditTarget(null)}
        />
      )}
      {deleteTarget && (
        <DeleteConfirmModal
          template={deleteTarget}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

// ---------- card ----------

interface TemplateCardProps {
  template: TemplateListRow;
  milestones: TemplateMilestoneRow[];
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function TemplateCard({
  template,
  milestones,
  expanded,
  onToggle,
  onEdit,
  onDelete,
}: TemplateCardProps) {
  const typeBadge =
    template.type === 'maintenance'
      ? 'bg-brand-teal-50 text-brand-teal-500'
      : 'bg-brand-gold-50 text-brand-gold-600';

  return (
    <div className="shadow-card overflow-hidden rounded-2xl bg-white">
      <div className="flex items-start gap-4 p-5">
        <button
          type="button"
          onClick={onToggle}
          className="hover:bg-brand-warm-50 rounded-lg p-1.5 text-gray-400 transition-all"
          aria-label={expanded ? 'Collapse' : 'Expand'}
          aria-expanded={expanded}
        >
          <ChevronRight
            size={16}
            strokeWidth={2}
            className={cn('transition-transform', expanded && 'rotate-90')}
          />
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-900">{template.name}</h3>
            <span className={cn('rounded-md px-2 py-0.5 text-[11px] font-medium', typeBadge)}>
              {template.type === 'maintenance' ? 'Maintenance' : 'Remodel'}
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] text-gray-400">
              <ListChecks size={12} strokeWidth={1.5} />
              {template.milestoneCount} {template.milestoneCount === 1 ? 'milestone' : 'milestones'}
            </span>
            {template.duration && (
              <span className="text-[11px] text-gray-400">· {template.duration}</span>
            )}
          </div>
          {template.description && (
            <p className="mt-1 truncate text-xs text-gray-500">{template.description}</p>
          )}
        </div>

        <div className="flex flex-shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Edit ${template.name}`}
            className="hover:text-brand-teal-500 rounded-lg p-1.5 text-gray-400 transition-all hover:bg-brand-warm-50"
          >
            <Pencil size={14} strokeWidth={1.5} />
          </button>
          <button
            type="button"
            onClick={onDelete}
            aria-label={`Delete ${template.name}`}
            className="rounded-lg p-1.5 text-gray-400 transition-all hover:bg-red-50 hover:text-red-500"
          >
            <Trash2 size={14} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="bg-brand-warm-50 border-t border-gray-100 px-5 py-4">
          {milestones.length === 0 ? (
            <p className="text-xs text-gray-400 italic">No milestones on this template.</p>
          ) : (
            <ol className="space-y-2">
              {milestones.map((m) => (
                <li
                  key={m.id}
                  className="flex items-start gap-3 rounded-xl bg-white px-3 py-2 text-sm"
                >
                  <span className="bg-brand-teal-50 text-brand-teal-500 mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-[10px] font-semibold">
                    {m.order}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-gray-900">{m.title}</div>
                    <div className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-gray-500">
                      {m.category && <span>{m.category}</span>}
                      {m.category && m.offset && <span className="text-gray-300">·</span>}
                      {m.offset && <span>{m.offset}</span>}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- empty state ----------

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="shadow-card rounded-2xl bg-white p-12 text-center">
      <div className="bg-brand-warm-200 mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full text-gray-400">
        <FolderPlus size={24} strokeWidth={1.5} />
      </div>
      <h3 className="text-base font-semibold text-gray-900">No project templates yet</h3>
      <p className="mx-auto mt-2 max-w-sm text-sm text-gray-500">
        Templates let you pre-define milestones for common project types — create one and save
        time on every new project.
      </p>
      <button
        type="button"
        onClick={onCreate}
        className="bg-brand-gold-400 hover:bg-brand-gold-500 shadow-soft mt-5 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 font-medium text-white transition-all"
      >
        <Plus size={16} />
        New template
      </button>
    </div>
  );
}

// ---------- modals ----------

interface TemplateFormState {
  name: string;
  type: ProjectTemplateType;
  description: string;
  duration: string;
  milestones: MilestoneDraft[];
}

interface MilestoneDraft {
  /** stable client-only id for React keys + reorder tracking. */
  key: string;
  title: string;
  category: string;
  offset: string;
}

function newDraft(partial: Partial<MilestoneDraft> = {}): MilestoneDraft {
  return {
    key: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Math.random()),
    title: partial.title ?? '',
    category: partial.category ?? '',
    offset: partial.offset ?? '',
  };
}

function CreateTemplateModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<TemplateFormState>({
    name: '',
    type: 'maintenance',
    description: '',
    duration: '',
    milestones: [newDraft()],
  });

  function submit() {
    setError(null);
    const validation = validateForm(form);
    if (validation) {
      setError(validation);
      return;
    }
    startTransition(async () => {
      const result = await createTemplate({
        name: form.name.trim(),
        type: form.type,
        description: form.description.trim() || null,
        duration: form.duration.trim() || null,
        milestones: toMilestoneInputs(form.milestones),
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
    <TemplateFormModal
      title="New template"
      submitLabel="Create template"
      submittingLabel="Creating..."
      form={form}
      setForm={setForm}
      error={error}
      isPending={isPending}
      onClose={onClose}
      onSubmit={submit}
    />
  );
}

function EditTemplateModal({
  template,
  initialMilestones,
  onClose,
}: {
  template: TemplateListRow;
  initialMilestones: TemplateMilestoneRow[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<TemplateFormState>({
    name: template.name,
    type: template.type,
    description: template.description ?? '',
    duration: template.duration ?? '',
    milestones:
      initialMilestones.length > 0
        ? initialMilestones.map((m) =>
            newDraft({ title: m.title, category: m.category ?? '', offset: m.offset ?? '' }),
          )
        : [newDraft()],
  });

  function submit() {
    setError(null);
    const validation = validateForm(form);
    if (validation) {
      setError(validation);
      return;
    }
    startTransition(async () => {
      const result = await updateTemplate(template.id, {
        name: form.name.trim(),
        type: form.type,
        description: form.description.trim() || null,
        duration: form.duration.trim() || null,
        milestones: toMilestoneInputs(form.milestones),
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
    <TemplateFormModal
      title={`Edit ${template.name}`}
      submitLabel="Save changes"
      submittingLabel="Saving..."
      form={form}
      setForm={setForm}
      error={error}
      isPending={isPending}
      onClose={onClose}
      onSubmit={submit}
    />
  );
}

function validateForm(form: TemplateFormState): string | null {
  if (!form.name.trim()) return 'Template name is required.';
  const titled = form.milestones.filter((m) => m.title.trim());
  if (titled.length === 0) return 'Add at least one milestone with a title.';
  return null;
}

function toMilestoneInputs(drafts: MilestoneDraft[]): TemplateMilestoneInput[] {
  return drafts
    .filter((m) => m.title.trim())
    .map((m, i) => ({
      title: m.title,
      category: m.category || null,
      offset: m.offset || null,
      order: i + 1,
    }));
}

interface TemplateFormModalProps {
  title: string;
  submitLabel: string;
  submittingLabel: string;
  form: TemplateFormState;
  setForm: React.Dispatch<React.SetStateAction<TemplateFormState>>;
  error: string | null;
  isPending: boolean;
  onClose: () => void;
  onSubmit: () => void;
}

function TemplateFormModal({
  title,
  submitLabel,
  submittingLabel,
  form,
  setForm,
  error,
  isPending,
  onClose,
  onSubmit,
}: TemplateFormModalProps) {
  function addMilestone() {
    setForm((prev) => ({ ...prev, milestones: [...prev.milestones, newDraft()] }));
  }

  function removeMilestone(key: string) {
    setForm((prev) => ({
      ...prev,
      milestones: prev.milestones.filter((m) => m.key !== key),
    }));
  }

  function updateMilestone(key: string, patch: Partial<MilestoneDraft>) {
    setForm((prev) => ({
      ...prev,
      milestones: prev.milestones.map((m) => (m.key === key ? { ...m, ...patch } : m)),
    }));
  }

  function moveMilestone(key: string, direction: 'up' | 'down') {
    setForm((prev) => {
      const idx = prev.milestones.findIndex((m) => m.key === key);
      if (idx === -1) return prev;
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= prev.milestones.length) return prev;
      const next = [...prev.milestones];
      [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
      return { ...prev, milestones: next };
    });
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
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
            placeholder="e.g. Annual Maintenance Plan"
            className={inputClass}
          />
        </Field>

        <Field label="Type" required>
          <div className="grid grid-cols-2 gap-2">
            {(['maintenance', 'remodel'] as const).map((t) => {
              const isActive = form.type === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, type: t }))}
                  className={cn(
                    'rounded-xl border px-3 py-2.5 text-sm font-medium transition-all',
                    isActive
                      ? 'border-brand-teal-500 bg-brand-teal-50 text-brand-teal-500'
                      : 'hover:border-brand-teal-200 hover:text-brand-teal-500 border-gray-200 text-gray-600',
                  )}
                >
                  {t === 'maintenance' ? 'Maintenance' : 'Remodel'}
                </button>
              );
            })}
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Duration" hint='Free text — e.g. "12 months", "4-6 weeks"'>
            <input
              type="text"
              value={form.duration}
              onChange={(e) => setForm((prev) => ({ ...prev, duration: e.target.value }))}
              className={inputClass}
            />
          </Field>
          <Field label="Description" hint="Optional">
            <input
              type="text"
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              className={inputClass}
            />
          </Field>
        </div>

        <div className="border-t border-gray-100 pt-4">
          <div className="mb-2 flex items-center justify-between">
            <label className="block text-xs font-semibold tracking-wider text-gray-500 uppercase">
              Milestones <span className="text-red-500">*</span>
            </label>
            <span className="text-xs text-gray-400">
              {form.milestones.filter((m) => m.title.trim()).length} titled
            </span>
          </div>

          <div className="space-y-2">
            {form.milestones.map((m, idx) => (
              <MilestoneRow
                key={m.key}
                milestone={m}
                index={idx}
                total={form.milestones.length}
                onUpdate={(patch) => updateMilestone(m.key, patch)}
                onRemove={() => removeMilestone(m.key)}
                onMoveUp={() => moveMilestone(m.key, 'up')}
                onMoveDown={() => moveMilestone(m.key, 'down')}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={addMilestone}
            className="hover:border-brand-teal-300 hover:text-brand-teal-500 mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-gray-200 py-2.5 text-sm font-medium text-gray-500 transition-all"
          >
            <Plus size={14} strokeWidth={1.5} />
            Add milestone
          </button>
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

interface MilestoneRowProps {
  milestone: MilestoneDraft;
  index: number;
  total: number;
  onUpdate: (patch: Partial<MilestoneDraft>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

function MilestoneRow({
  milestone,
  index,
  total,
  onUpdate,
  onRemove,
  onMoveUp,
  onMoveDown,
}: MilestoneRowProps) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-gray-200 bg-white p-3">
      <div className="flex flex-col gap-0.5 pt-1">
        <button
          type="button"
          onClick={onMoveUp}
          disabled={index === 0}
          aria-label="Move up"
          className="hover:text-brand-teal-500 rounded p-1 text-gray-400 transition-all hover:bg-brand-warm-50 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ArrowUp size={12} strokeWidth={2} />
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={index === total - 1}
          aria-label="Move down"
          className="hover:text-brand-teal-500 rounded p-1 text-gray-400 transition-all hover:bg-brand-warm-50 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ArrowDown size={12} strokeWidth={2} />
        </button>
      </div>

      <span className="bg-brand-teal-50 text-brand-teal-500 mt-2 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-[10px] font-semibold">
        {index + 1}
      </span>

      <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-[2fr_1fr_1fr]">
        <input
          type="text"
          value={milestone.title}
          onChange={(e) => onUpdate({ title: e.target.value })}
          placeholder="Title (required)"
          className="focus:ring-brand-teal-200 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:ring-2 focus:outline-none"
        />
        <input
          type="text"
          value={milestone.category}
          onChange={(e) => onUpdate({ category: e.target.value })}
          placeholder="Category"
          className="focus:ring-brand-teal-200 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:ring-2 focus:outline-none"
        />
        <input
          type="text"
          value={milestone.offset}
          onChange={(e) => onUpdate({ offset: e.target.value })}
          placeholder="Offset (e.g. Month 1)"
          className="focus:ring-brand-teal-200 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:ring-2 focus:outline-none"
        />
      </div>

      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove milestone"
        className="mt-1 rounded p-1.5 text-gray-400 transition-all hover:bg-red-50 hover:text-red-500"
      >
        <X size={14} strokeWidth={2} />
      </button>
    </div>
  );
}

// ---------- delete confirm ----------

function DeleteConfirmModal({
  template,
  onClose,
}: {
  template: TemplateListRow;
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await deleteTemplate(template.id);
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
      title="Delete template?"
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
        You&apos;re about to delete{' '}
        <strong className="font-semibold">{template.name}</strong> and its{' '}
        {template.milestoneCount} {template.milestoneCount === 1 ? 'milestone' : 'milestones'}.
      </p>
      <p className="text-sm text-gray-500">
        Projects already created from this template keep their own milestones — they&apos;re
        copies, not references.
      </p>
      {error && (
        <div className="mt-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}
    </Modal>
  );
}

