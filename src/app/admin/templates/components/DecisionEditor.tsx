'use client';

import { AlertCircle, Check, Image as ImageIcon, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { useToast } from '@/components/admin/ToastProvider';
import { cn } from '@/lib/utils';
import {
  deleteDecisionOptionImage,
  uploadDecisionOptionImage,
} from '../actions';
import { useBuilder } from '../builder-context';
import {
  newMilestone,
  type BuilderDecisionOption,
  type BuilderMilestone,
  type DecisionType,
} from '../builder-types';

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

      {/* Show option thumbnails inline when collapsed — gives a glance at
          which options have images without entering edit mode. */}
      {showOptions && decision.decisionOptions.some((o) => o.imageUrl) && (
        <div className="mt-2 ml-4 flex flex-wrap gap-1">
          {decision.decisionOptions
            .filter((o) => o.imageUrl)
            .map((o, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={o.imageUrl!}
                alt={o.label}
                className="h-8 w-8 rounded border border-pink-100 object-cover"
                loading="lazy"
              />
            ))}
        </div>
      )}
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
  const [options, setOptions] = useState<BuilderDecisionOption[]>(
    decision.decisionOptions.length > 0 ? decision.decisionOptions : [emptyOption()],
  );

  const showOptions = TYPES_WITH_OPTIONS.includes(type);

  function save() {
    const cleanOptions = showOptions
      ? options.filter((o) => o.label.trim())
      : [];
    onSave({
      title: question.trim(),
      decisionQuestion: question.trim(),
      decisionType: type,
      decisionOptions: cleanOptions,
    });
  }

  function patchOption(idx: number, patch: Partial<BuilderDecisionOption>) {
    setOptions((prev) => prev.map((o, i) => (i === idx ? { ...o, ...patch } : o)));
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
        <div className="space-y-2">
          {options.map((opt, i) => (
            <OptionRowEdit
              key={i}
              option={opt}
              onChange={(patch) => patchOption(i, patch)}
              onRemove={() => removeOption(i)}
              canRemove={options.length > 1}
            />
          ))}
          <button
            type="button"
            onClick={() => setOptions((prev) => [...prev, emptyOption()])}
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

/**
 * Single option row in the edit form. Image is uploaded immediately on
 * file selection — the spinner overlays the thumbnail until the server
 * action returns. Removing or replacing an existing image fires a
 * background delete so storage doesn't accumulate unreferenced files
 * during the editing session.
 */
function OptionRowEdit({
  option,
  onChange,
  onRemove,
  canRemove,
}: {
  option: BuilderDecisionOption;
  onChange: (patch: Partial<BuilderDecisionOption>) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const { showToast } = useToast();
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file later
    if (!file) return;

    // If the option already had an image, fire-and-forget the delete so
    // we don't accumulate orphans on every replacement. The server will
    // log + ignore failures; the new upload is the user-visible action.
    const previousPath = option.imageStoragePath;

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    const result = await uploadDecisionOptionImage(formData);
    setUploading(false);

    if (!result.success) {
      showToast(result.error, 'error');
      return;
    }

    onChange({ imageStoragePath: result.path, imageUrl: result.signedUrl });

    if (previousPath) {
      // Background delete — ignore the result; the worst case is one
      // orphaned image, not a UX-blocking failure.
      void deleteDecisionOptionImage(previousPath);
    }
  }

  async function handleRemoveImage() {
    if (!option.imageStoragePath) return;
    const previousPath = option.imageStoragePath;
    onChange({ imageStoragePath: null, imageUrl: null });
    void deleteDecisionOptionImage(previousPath);
  }

  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50/50 p-2">
      <div className="flex gap-2">
        {/* Image zone */}
        <div className="relative flex-shrink-0">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            onMouseDown={stopCanvasEvent}
            disabled={uploading}
            className={cn(
              'flex h-16 w-16 items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-white transition-all',
              !uploading && 'hover:border-brand-teal-300 hover:bg-brand-warm-50',
              uploading && 'cursor-wait',
            )}
            aria-label={option.imageStoragePath ? 'Replace image' : 'Add image'}
          >
            {option.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={option.imageUrl}
                alt={option.label || 'Option'}
                className="h-full w-full object-cover"
              />
            ) : (
              <ImageIcon size={20} strokeWidth={1.25} className="text-gray-300" />
            )}
            {uploading && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/80">
                <Loader2 size={16} strokeWidth={2} className="animate-spin text-gray-500" />
              </div>
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFile}
            onClick={stopCanvasEvent}
            className="hidden"
          />
          {option.imageStoragePath && !uploading && (
            <button
              type="button"
              onClick={handleRemoveImage}
              onMouseDown={stopCanvasEvent}
              aria-label="Remove image"
              className="absolute -top-1.5 -right-1.5 rounded-full bg-white p-0.5 text-gray-400 shadow-sm ring-1 ring-gray-200 transition-all hover:text-red-500"
            >
              <Trash2 size={10} strokeWidth={2} />
            </button>
          )}
        </div>

        {/* Label + description + remove */}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex gap-1">
            <input
              type="text"
              value={option.label}
              onChange={(e) => onChange({ label: e.target.value })}
              onMouseDown={stopCanvasEvent}
              onKeyDown={stopCanvasEvent}
              placeholder="Option label"
              className={cn(editInputClass, 'flex-1')}
            />
            <button
              type="button"
              onClick={onRemove}
              onMouseDown={stopCanvasEvent}
              disabled={!canRemove}
              aria-label="Remove option"
              className="rounded p-1 text-gray-400 transition-all hover:bg-red-50 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <X size={12} strokeWidth={2} />
            </button>
          </div>
          <input
            type="text"
            value={option.description ?? ''}
            onChange={(e) => onChange({ description: e.target.value || null })}
            onMouseDown={stopCanvasEvent}
            onKeyDown={stopCanvasEvent}
            placeholder="Short description (optional)"
            className={editInputClass}
          />
        </div>
      </div>
    </div>
  );
}

function emptyOption(): BuilderDecisionOption {
  return { label: '', imageStoragePath: null, imageUrl: null, description: null };
}

const editInputClass =
  'w-full rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-900 focus:border-pink-300 focus:outline-none focus:ring-2 focus:ring-pink-200';

function stopCanvasEvent(e: React.SyntheticEvent) {
  e.stopPropagation();
}
