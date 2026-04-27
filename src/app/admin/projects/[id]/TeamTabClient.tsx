'use client';

import { Plus, Search, UserPlus, Users, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { LoadingDots } from '@/components/admin/LoadingDots';
import { Modal } from '@/components/admin/Modal';
import { useToast } from '@/components/admin/ToastProvider';
import { cn } from '@/lib/utils';
import { assignStaffToProject, unassignStaffFromProject } from './actions';
import type { FieldStaffPickerRow, ProjectAssignmentRow } from './queries';

interface Props {
  projectId: string;
  assignments: ProjectAssignmentRow[];
  pickerOptions: FieldStaffPickerRow[];
}

export function TeamTabClient({ projectId, assignments, pickerOptions }: Props) {
  const router = useRouter();
  const { showToast } = useToast();
  const [, startTransition] = useTransition();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<ProjectAssignmentRow | null>(null);

  // Drop already-assigned profiles from the picker — filtering out
  // matches the spec's "simpler than disabling" call. Re-derived on
  // every render but the lists are short.
  const assignedIds = useMemo(
    () => new Set(assignments.map((a) => a.profileId)),
    [assignments],
  );
  const availableStaff = useMemo(
    () => pickerOptions.filter((s) => !assignedIds.has(s.profileId)),
    [pickerOptions, assignedIds],
  );

  function handleAssign(profileId: string) {
    startTransition(async () => {
      const result = await assignStaffToProject(projectId, profileId);
      if (!result.success) {
        showToast(result.error, 'error');
        return;
      }
      showToast('Staff assigned');
      setPickerOpen(false);
      router.refresh();
    });
  }

  function handleRemove(profileId: string) {
    startTransition(async () => {
      const result = await unassignStaffFromProject(projectId, profileId);
      if (!result.success) {
        showToast(result.error, 'error');
        return;
      }
      showToast('Staff removed');
      setConfirmRemove(null);
      router.refresh();
    });
  }

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-xs font-semibold tracking-wider text-gray-500 uppercase">
          Team
        </h2>
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="bg-brand-gold-400 hover:bg-brand-gold-500 shadow-soft inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-white transition-all"
        >
          <Plus size={14} strokeWidth={2} />
          Add staff
        </button>
      </div>

      {assignments.length === 0 ? (
        <EmptyState onAdd={() => setPickerOpen(true)} />
      ) : (
        <div className="shadow-card overflow-hidden rounded-2xl bg-white">
          {assignments.map((a, i) => (
            <AssignmentRow
              key={a.profileId}
              assignment={a}
              isLast={i === assignments.length - 1}
              onRemove={() => setConfirmRemove(a)}
            />
          ))}
        </div>
      )}

      {pickerOpen && (
        <AddStaffModal
          available={availableStaff}
          onClose={() => setPickerOpen(false)}
          onPick={handleAssign}
          totalActive={pickerOptions.length}
        />
      )}

      {confirmRemove && (
        <RemoveConfirmModal
          assignment={confirmRemove}
          onClose={() => setConfirmRemove(null)}
          onConfirm={() => handleRemove(confirmRemove.profileId)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Row + empty
// ---------------------------------------------------------------------------

function AssignmentRow({
  assignment,
  isLast,
  onRemove,
}: {
  assignment: ProjectAssignmentRow;
  isLast: boolean;
  onRemove: () => void;
}) {
  return (
    <div
      className={cn(
        'group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-brand-warm-50',
        !isLast && 'border-b border-gray-50',
      )}
    >
      <span className="bg-brand-teal-50 text-brand-teal-500 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold">
        {initialsOf(assignment.name)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-gray-900">{assignment.name}</div>
        <div className="mt-0.5 text-xs text-gray-500">
          Assigned {formatRelative(assignment.assignedAt)}
        </div>
      </div>
      <button
        type="button"
        onClick={onRemove}
        title={`Remove ${assignment.name} from this project`}
        aria-label={`Remove ${assignment.name}`}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 opacity-0 transition-all hover:bg-red-50 hover:text-red-600 focus:opacity-100 group-hover:opacity-100"
      >
        <X size={14} strokeWidth={1.75} />
      </button>
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="shadow-card rounded-2xl bg-white p-12 text-center">
      <div className="bg-brand-warm-200 mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full text-gray-400">
        <Users size={24} strokeWidth={1.5} />
      </div>
      <h3 className="text-base font-semibold text-gray-900">No staff assigned yet</h3>
      <p className="mx-auto mt-2 max-w-sm text-sm text-gray-500">
        Click &ldquo;Add staff&rdquo; to assign field staff to this project.
      </p>
      <button
        type="button"
        onClick={onAdd}
        className="bg-brand-gold-400 hover:bg-brand-gold-500 shadow-soft mt-5 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 font-medium text-white transition-all"
      >
        <Plus size={16} strokeWidth={2} />
        Add staff
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add modal
// ---------------------------------------------------------------------------

function AddStaffModal({
  available,
  totalActive,
  onClose,
  onPick,
}: {
  available: FieldStaffPickerRow[];
  totalActive: number;
  onClose: () => void;
  onPick: (profileId: string) => void;
}) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return available;
    return available.filter((s) => s.name.toLowerCase().includes(q));
  }, [available, query]);

  // Show the search input once we'd otherwise have a long list — keeps
  // the modal lightweight for the common 1-3 staff case.
  const showSearch = available.length > 6;

  return (
    <Modal open onClose={onClose} title="Add staff" size="md">
      {available.length === 0 ? (
        <div className="py-6 text-center text-sm text-gray-500">
          {totalActive === 0 ? (
            <>No active field staff yet. Invite one from the Staff page first.</>
          ) : (
            <>Every active field staff member is already assigned to this project.</>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {showSearch && (
            <div className="relative">
              <Search
                size={14}
                strokeWidth={1.5}
                className="absolute top-1/2 left-3.5 -translate-y-1/2 text-gray-400"
              />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name"
                autoFocus
                className="focus:ring-brand-teal-200 focus:border-brand-teal-400 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 pl-9 text-sm transition-all outline-none focus:ring-2"
              />
            </div>
          )}

          <div className="-mx-2 max-h-[55vh] overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-2 py-4 text-center text-sm text-gray-400">
                No staff match &ldquo;{query}&rdquo;.
              </div>
            ) : (
              <ul className="divide-y divide-gray-50">
                {filtered.map((s) => (
                  <li key={s.profileId}>
                    <button
                      type="button"
                      onClick={() => onPick(s.profileId)}
                      className="hover:bg-brand-warm-50 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors"
                    >
                      <span className="bg-brand-teal-50 text-brand-teal-500 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold">
                        {initialsOf(s.name)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-gray-900">
                          {s.name}
                        </div>
                        <div className="text-xs text-gray-500">
                          {assignmentLoadLabel(s.currentAssignmentCount)}
                        </div>
                      </div>
                      <UserPlus size={14} strokeWidth={1.75} className="text-brand-teal-500" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Remove confirm
// ---------------------------------------------------------------------------

function RemoveConfirmModal({
  assignment,
  onClose,
  onConfirm,
}: {
  assignment: ProjectAssignmentRow;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  return (
    <Modal
      open
      onClose={onClose}
      title="Remove from project?"
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
            onClick={() => startTransition(onConfirm)}
            disabled={isPending}
            className="shadow-soft inline-flex items-center gap-1.5 rounded-xl bg-red-500 px-5 py-2.5 font-medium text-white transition-all hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? (
              <>
                Removing
                <LoadingDots />
              </>
            ) : (
              <>
                <X size={14} strokeWidth={2} />
                Remove
              </>
            )}
          </button>
        </>
      }
    >
      <p className="text-sm text-gray-700">
        Remove <strong className="font-semibold">{assignment.name}</strong> from this
        project? They&apos;ll lose access to its property and projects on the field app
        immediately. Existing photo uploads stay attached either way.
      </p>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function initialsOf(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '·';
}

function assignmentLoadLabel(n: number): string {
  if (n === 0) return 'No current projects';
  if (n === 1) return '1 current project';
  return `${n} current projects`;
}

function formatRelative(d: Date): string {
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay} day${diffDay === 1 ? '' : 's'} ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
