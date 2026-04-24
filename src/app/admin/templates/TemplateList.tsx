'use client';

import { FolderPlus, Layers, ListChecks, Pencil, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { LoadingDots } from '@/components/admin/LoadingDots';
import { Modal } from '@/components/admin/Modal';
import { useToast } from '@/components/admin/ToastProvider';
import { cn } from '@/lib/utils';
import { deleteTemplate } from './actions';
import type { TemplateListRow } from './queries';

interface Props {
  templates: TemplateListRow[];
}

export function TemplateList({ templates }: Props) {
  const [deleteTarget, setDeleteTarget] = useState<TemplateListRow | null>(null);

  return (
    <div>
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="text-sm text-gray-500">
          {templates.length} {templates.length === 1 ? 'template' : 'templates'}
        </div>
        <Link
          href="/admin/templates?mode=builder"
          className="bg-brand-gold-400 hover:bg-brand-gold-500 shadow-soft inline-flex items-center gap-2 rounded-xl px-5 py-2.5 font-medium text-white transition-all duration-150"
        >
          <Plus size={16} strokeWidth={2} />
          New template
        </Link>
      </div>

      {templates.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-3">
          {templates.map((t) => (
            <TemplateCard key={t.id} template={t} onDelete={() => setDeleteTarget(t)} />
          ))}
        </div>
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

function TemplateCard({
  template,
  onDelete,
}: {
  template: TemplateListRow;
  onDelete: () => void;
}) {
  const typeBadge =
    template.type === 'maintenance'
      ? 'bg-brand-teal-50 text-brand-teal-500'
      : 'bg-brand-gold-50 text-brand-gold-600';

  return (
    <div className="shadow-card group flex items-start gap-4 rounded-2xl bg-white p-5 transition-all hover:shadow-elevated">
      <div className="bg-brand-warm-200 text-brand-teal-500 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl">
        <Layers size={18} strokeWidth={1.5} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-900">{template.name}</h3>
          <span className={cn('rounded-md px-2 py-0.5 text-[11px] font-medium', typeBadge)}>
            {template.type === 'maintenance' ? 'Maintenance' : 'Remodel'}
          </span>
          {template.usesPhases && (
            <span className="rounded-md bg-brand-teal-50 px-2 py-0.5 text-[11px] font-medium text-brand-teal-500">
              Phased
            </span>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 text-[11px] text-gray-500">
          <span className="inline-flex items-center gap-1">
            <ListChecks size={11} strokeWidth={1.5} />
            {template.milestoneCount} {template.milestoneCount === 1 ? 'milestone' : 'milestones'}
          </span>
          {template.duration && <span>· {template.duration}</span>}
        </div>
        {template.description && (
          <p className="mt-1 truncate text-xs text-gray-500">{template.description}</p>
        )}
      </div>

      <div className="flex flex-shrink-0 items-center gap-1">
        <Link
          href={`/admin/templates?mode=builder&id=${template.id}`}
          aria-label={`Edit ${template.name}`}
          className="hover:text-brand-teal-500 rounded-lg p-1.5 text-gray-400 transition-all hover:bg-brand-warm-50"
        >
          <Pencil size={14} strokeWidth={1.5} />
        </Link>
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
  );
}

function EmptyState() {
  return (
    <div className="shadow-card rounded-2xl bg-white p-12 text-center">
      <div className="bg-brand-warm-200 mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full text-gray-400">
        <FolderPlus size={24} strokeWidth={1.5} />
      </div>
      <h3 className="text-base font-semibold text-gray-900">No project templates yet</h3>
      <p className="mx-auto mt-2 max-w-sm text-sm text-gray-500">
        Templates let you pre-define phases and milestones for common projects — create one to
        start saving time.
      </p>
      <Link
        href="/admin/templates?mode=builder"
        className="bg-brand-gold-400 hover:bg-brand-gold-500 shadow-soft mt-5 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 font-medium text-white transition-all"
      >
        <Plus size={16} />
        New template
      </Link>
    </div>
  );
}

function DeleteConfirmModal({
  template,
  onClose,
}: {
  template: TemplateListRow;
  onClose: () => void;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await deleteTemplate(template.id);
      if (!result.success) {
        setError(result.error);
        showToast(result.error, 'error');
        return;
      }
      showToast('Template deleted');
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
        You&apos;re about to delete{' '}
        <strong className="font-semibold">{template.name}</strong>.
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
