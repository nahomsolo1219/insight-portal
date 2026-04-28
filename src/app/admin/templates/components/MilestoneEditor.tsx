'use client';

import { Check, Pencil, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useBuilder } from '../builder-context';
import { newMilestone, type BuilderMilestone } from '../builder-types';

/**
 * List + inline editor for regular (non-decision) milestones inside a phase
 * node. Decision points get their own editor so the UI can highlight them
 * separately without special-casing every row.
 *
 * Event propagation: every interactive element calls `stopCanvasEvent`
 * which blocks mousedown and keydown so typing doesn't trigger React
 * Flow's canvas shortcuts (Delete removes the node, Space pans, etc.).
 */
interface Props {
  phaseId: string;
  milestones: BuilderMilestone[];
}

export function MilestoneEditor({ phaseId, milestones }: Props) {
  const { addMilestone, updateMilestone, deleteMilestone } = useBuilder();
  const regular = milestones.filter((m) => !m.isDecisionPoint);
  const [editingId, setEditingId] = useState<string | null>(null);

  function handleAdd() {
    const m = newMilestone({ isDecisionPoint: false });
    addMilestone(phaseId, m);
    setEditingId(m.id);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-[10px] font-semibold tracking-wider text-gray-500 uppercase">
          Milestones
        </h4>
        <span className="text-[11px] text-gray-400">{regular.length}</span>
      </div>

      {regular.length === 0 && editingId === null && (
        <p className="py-2 text-xs text-gray-400 italic">No milestones yet.</p>
      )}

      <div className="space-y-1.5">
        {regular.map((m) =>
          editingId === m.id ? (
            <MilestoneRowEdit
              key={m.id}
              milestone={m}
              onSave={(patch) => {
                updateMilestone(phaseId, m.id, patch);
                setEditingId(null);
              }}
              onCancel={() => {
                // If the row has never had a title, drop it on cancel.
                if (!m.title.trim()) deleteMilestone(phaseId, m.id);
                setEditingId(null);
              }}
              onDelete={() => {
                deleteMilestone(phaseId, m.id);
                setEditingId(null);
              }}
            />
          ) : (
            <MilestoneRowDisplay
              key={m.id}
              milestone={m}
              onEdit={() => setEditingId(m.id)}
              onDelete={() => deleteMilestone(phaseId, m.id)}
            />
          ),
        )}
      </div>

      <button
        type="button"
        onClick={handleAdd}
        onMouseDown={stopCanvasEvent}
        className="hover:border-brand-teal-300 hover:text-brand-teal-500 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-line py-1.5 text-xs font-medium text-gray-500 transition-all"
      >
        <Plus size={12} strokeWidth={2} />
        Add milestone
      </button>
    </div>
  );
}

function MilestoneRowDisplay({
  milestone,
  onEdit,
  onDelete,
}: {
  milestone: BuilderMilestone;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="hover:bg-brand-warm-50 group flex items-center gap-2 rounded-lg px-2 py-1.5">
      <span className="bg-brand-teal-50 h-1.5 w-1.5 flex-shrink-0 rounded-full" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-medium text-gray-900">
          {milestone.title || 'Untitled milestone'}
        </div>
        {milestone.category && (
          <div className="truncate text-[10px] text-gray-500">{milestone.category}</div>
        )}
      </div>
      <div className="flex opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          onClick={onEdit}
          onMouseDown={stopCanvasEvent}
          aria-label="Edit"
          className="hover:text-brand-teal-500 rounded p-1 text-gray-400 transition-all hover:bg-cream"
        >
          <Pencil size={11} strokeWidth={1.5} />
        </button>
        <button
          type="button"
          onClick={onDelete}
          onMouseDown={stopCanvasEvent}
          aria-label="Delete"
          className="rounded p-1 text-gray-400 transition-all hover:bg-red-50 hover:text-red-500"
        >
          <X size={11} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}

function MilestoneRowEdit({
  milestone,
  onSave,
  onCancel,
  onDelete,
}: {
  milestone: BuilderMilestone;
  onSave: (patch: Partial<BuilderMilestone>) => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const [title, setTitle] = useState(milestone.title);
  const [category, setCategory] = useState(milestone.category);
  const [description, setDescription] = useState(milestone.description);

  function save() {
    onSave({ title: title.trim(), category: category.trim(), description: description.trim() });
  }

  return (
    <div className="space-y-2 rounded-lg border border-brand-teal-200 bg-paper p-2">
      <div className="grid grid-cols-[2fr_1fr] gap-1.5">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onMouseDown={stopCanvasEvent}
          onKeyDown={stopCanvasEvent}
          placeholder="Title"
          autoFocus
          className={editInputClass}
        />
        <input
          type="text"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          onMouseDown={stopCanvasEvent}
          onKeyDown={stopCanvasEvent}
          placeholder="Category"
          className={editInputClass}
        />
      </div>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        onMouseDown={stopCanvasEvent}
        onKeyDown={stopCanvasEvent}
        placeholder="Detail (optional)"
        rows={2}
        className={cn(editInputClass, 'resize-none')}
      />
      <div className="flex items-center justify-between gap-1">
        <button
          type="button"
          onClick={onDelete}
          onMouseDown={stopCanvasEvent}
          className="rounded px-2 py-1 text-[11px] font-medium text-red-500 transition-all hover:bg-red-50"
        >
          Delete
        </button>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={onCancel}
            onMouseDown={stopCanvasEvent}
            className="rounded px-2 py-1 text-[11px] font-medium text-gray-500 transition-all hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            onMouseDown={stopCanvasEvent}
            disabled={!title.trim()}
            className="bg-brand-teal-500 hover:bg-brand-teal-600 inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-white transition-all disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Check size={10} strokeWidth={2.5} />
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

const editInputClass =
  'w-full rounded-md border border-line bg-paper px-2 py-1 text-xs text-gray-900 focus:border-brand-teal-300 focus:outline-none focus:ring-2 focus:ring-brand-teal-200';

/**
 * Swallow mouse / key events so they don't bubble to React Flow's canvas
 * handlers. Without this, Delete deletes the node and Space pans while
 * the user is typing.
 */
function stopCanvasEvent(e: React.SyntheticEvent) {
  e.stopPropagation();
}
