'use client';

import { AlertCircle, Check, Pencil, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useBuilder } from '../builder-context';
import { newMilestone, type BuilderMilestone, type DecisionType } from '../builder-types';

const TYPE_LABELS: Record<DecisionType, string> = {
  single: 'Single choice',
  multi: 'Multiple choice',
  approval: 'Approval',
  open: 'Open text',
  acknowledge: 'Acknowledge',
};

const TYPES_WITH_OPTIONS: DecisionType[] = ['single', 'multi'];

interface Props {
  phaseId: string;
  milestones: BuilderMilestone[];
}

export function DecisionEditor({ phaseId, milestones }: Props) {
  const { addMilestone, updateMilestone, deleteMilestone } = useBuilder();
  const decisions = milestones.filter((m) => m.isDecisionPoint);
  const [editingId, setEditingId] = useState<string | null>(null);

  function handleAdd() {
    const m = newMilestone({ isDecisionPoint: true, decisionType: 'single' });
    addMilestone(phaseId, m);
    setEditingId(m.id);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="inline-flex items-center gap-1 text-[10px] font-semibold tracking-wider text-gray-500 uppercase">
          <AlertCircle size={10} strokeWidth={2} className="text-pink-500" />
          Decision points
        </h4>
        <span className="text-[11px] text-gray-400">{decisions.length}</span>
      </div>

      <div className="space-y-1.5">
        {decisions.map((m) =>
          editingId === m.id ? (
            <DecisionRowEdit
              key={m.id}
              decision={m}
              onSave={(patch) => {
                updateMilestone(phaseId, m.id, patch);
                setEditingId(null);
              }}
              onCancel={() => {
                if (!m.decisionQuestion.trim()) deleteMilestone(phaseId, m.id);
                setEditingId(null);
              }}
              onDelete={() => {
                deleteMilestone(phaseId, m.id);
                setEditingId(null);
              }}
            />
          ) : (
            <DecisionRowDisplay
              key={m.id}
              decision={m}
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
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-pink-200 py-1.5 text-xs font-medium text-pink-500 transition-all hover:border-pink-300 hover:bg-pink-50"
      >
        <Plus size={12} strokeWidth={2} />
        Add decision point
      </button>
    </div>
  );
}

function DecisionRowDisplay({
  decision,
  onEdit,
  onDelete,
}: {
  decision: BuilderMilestone;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const type = decision.decisionType || 'single';
  const showOptions = TYPES_WITH_OPTIONS.includes(type as DecisionType);

  return (
    <div className="group rounded-lg border border-pink-100 bg-pink-50/50 p-2">
      <div className="flex items-start gap-2">
        <AlertCircle size={12} strokeWidth={2} className="mt-0.5 flex-shrink-0 text-pink-500" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-medium text-gray-900">
            {decision.decisionQuestion || 'Unnamed decision'}
          </div>
          <div className="mt-0.5 text-[10px] text-gray-500">
            {TYPE_LABELS[type as DecisionType]}
            {showOptions && decision.decisionOptions.length > 0 && (
              <> · {decision.decisionOptions.length} options</>
            )}
          </div>
        </div>
        <div className="flex flex-shrink-0 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            onClick={onEdit}
            onMouseDown={stopCanvasEvent}
            aria-label="Edit"
            className="rounded p-1 text-gray-400 transition-all hover:bg-white hover:text-pink-500"
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
    </div>
  );
}

function DecisionRowEdit({
  decision,
  onSave,
  onCancel,
  onDelete,
}: {
  decision: BuilderMilestone;
  onSave: (patch: Partial<BuilderMilestone>) => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const [question, setQuestion] = useState(decision.decisionQuestion);
  const [type, setType] = useState<DecisionType>(
    (decision.decisionType || 'single') as DecisionType,
  );
  const [options, setOptions] = useState<string[]>(
    decision.decisionOptions.length > 0 ? decision.decisionOptions : [''],
  );

  const showOptions = TYPES_WITH_OPTIONS.includes(type);

  function save() {
    const cleanOptions = showOptions ? options.map((o) => o.trim()).filter(Boolean) : [];
    onSave({
      // Decisions also have a `title` — use the question so display paths
      // that show `milestone.title` don't render blank for decision rows.
      title: question.trim(),
      decisionQuestion: question.trim(),
      decisionType: type,
      decisionOptions: cleanOptions,
    });
  }

  function updateOption(idx: number, value: string) {
    setOptions((prev) => prev.map((o, i) => (i === idx ? value : o)));
  }

  function removeOption(idx: number) {
    setOptions((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev));
  }

  return (
    <div className="space-y-2 rounded-lg border border-pink-200 bg-white p-2">
      <input
        type="text"
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        onMouseDown={stopCanvasEvent}
        onKeyDown={stopCanvasEvent}
        placeholder="What's the question?"
        autoFocus
        className={editInputClass}
      />
      <select
        value={type}
        onChange={(e) => setType(e.target.value as DecisionType)}
        onMouseDown={stopCanvasEvent}
        onKeyDown={stopCanvasEvent}
        className={editInputClass}
      >
        {(Object.entries(TYPE_LABELS) as [DecisionType, string][]).map(([id, label]) => (
          <option key={id} value={id}>
            {label}
          </option>
        ))}
      </select>

      {showOptions && (
        <div className="space-y-1">
          {options.map((opt, i) => (
            <div key={i} className="flex gap-1">
              <input
                type="text"
                value={opt}
                onChange={(e) => updateOption(i, e.target.value)}
                onMouseDown={stopCanvasEvent}
                onKeyDown={stopCanvasEvent}
                placeholder={`Option ${i + 1}`}
                className={cn(editInputClass, 'flex-1')}
              />
              <button
                type="button"
                onClick={() => removeOption(i)}
                onMouseDown={stopCanvasEvent}
                disabled={options.length <= 1}
                aria-label="Remove option"
                className="rounded p-1 text-gray-400 transition-all hover:bg-red-50 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-30"
              >
                <X size={12} strokeWidth={2} />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setOptions((prev) => [...prev, ''])}
            onMouseDown={stopCanvasEvent}
            className="inline-flex w-full items-center justify-center gap-1 rounded border border-dashed border-gray-200 py-1 text-[11px] text-gray-500 hover:border-pink-300 hover:text-pink-500"
          >
            <Plus size={10} strokeWidth={2} />
            Add option
          </button>
        </div>
      )}

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
            disabled={!question.trim()}
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
  'w-full rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-900 focus:border-pink-300 focus:outline-none focus:ring-2 focus:ring-pink-200';

function stopCanvasEvent(e: React.SyntheticEvent) {
  e.stopPropagation();
}
