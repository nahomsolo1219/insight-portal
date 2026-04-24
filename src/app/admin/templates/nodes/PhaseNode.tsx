'use client';

import { Handle, Position, type NodeProps } from '@xyflow/react';
import { AlertCircle, ChevronDown, ChevronRight, Clock, ListChecks, Trash2 } from 'lucide-react';
import { memo } from 'react';
import { cn } from '@/lib/utils';
import { useBuilder } from '../builder-context';
import type { PhaseNode as PhaseNodeType, PhotoDocumentation } from '../builder-types';
import { DecisionEditor } from '../components/DecisionEditor';
import { MilestoneEditor } from '../components/MilestoneEditor';

const PHOTO_DOC_LABELS: Record<PhotoDocumentation, string> = {
  none: 'No photos required',
  before_after: 'Before + After',
  before_during_after: 'Before + During + After',
  during_only: 'During only',
};

/**
 * The canvas render of a template phase. Two states:
 *
 * - Collapsed: shows title, phase number, milestone/decision counts,
 *   duration. Small and browsable from the minimap.
 * - Expanded: all editable fields — title, duration + days, photo docs,
 *   description, milestones list (regular + decisions).
 *
 * Connection handles sit on top (incoming dep) and bottom (outgoing dep).
 * React Flow wires them by position; the source/target id is the node id.
 *
 * Memoized so React Flow doesn't re-render every node on each edit. The
 * callbacks come through BuilderProvider context so `data` stays stable.
 */
function PhaseNodeImpl({ id, data, selected }: NodeProps<PhaseNodeType>) {
  const { updatePhase, deletePhase, toggleExpanded, isExpanded } = useBuilder();
  const expanded = isExpanded(id);

  const phase = data;
  const regularCount = phase.milestones.filter((m) => !m.isDecisionPoint).length;
  const decisionCount = phase.milestones.filter((m) => m.isDecisionPoint).length;

  return (
    <div
      className={cn(
        'w-[420px] overflow-hidden rounded-2xl border bg-white shadow-card transition-all',
        selected ? 'border-brand-teal-500 ring-2 ring-brand-teal-200' : 'border-gray-100',
      )}
    >
      {/* Incoming handle (top) */}
      <Handle
        type="target"
        position={Position.Top}
        className="!h-3 !w-3 !border-2 !border-white !bg-brand-teal-300 hover:!scale-130"
      />

      {/* Collapsed header — click to toggle */}
      <button
        type="button"
        onClick={() => toggleExpanded(id)}
        onMouseDown={stopCanvasEvent}
        className="hover:bg-brand-warm-50 flex w-full items-start gap-3 p-4 text-left transition-colors"
      >
        <div className="bg-brand-teal-500 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white">
          {phase.phaseNumber}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-gray-900">
            {phase.title || 'Untitled phase'}
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-gray-500">
            <span className="inline-flex items-center gap-1">
              <ListChecks size={11} strokeWidth={1.5} />
              {regularCount} {regularCount === 1 ? 'milestone' : 'milestones'}
            </span>
            {decisionCount > 0 && (
              <span className="inline-flex items-center gap-1 text-pink-600">
                <AlertCircle size={11} strokeWidth={1.5} />
                {decisionCount} {decisionCount === 1 ? 'decision' : 'decisions'}
              </span>
            )}
            {phase.estimatedDuration && (
              <span className="inline-flex items-center gap-1">
                <Clock size={11} strokeWidth={1.5} />
                {phase.estimatedDuration}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-1">
          <span
            onClick={(e) => {
              e.stopPropagation();
              if (confirm('Delete this phase?')) deletePhase(id);
            }}
            onMouseDown={stopCanvasEvent}
            role="button"
            tabIndex={0}
            aria-label="Delete phase"
            className="rounded-lg p-1.5 text-gray-400 transition-all hover:bg-red-50 hover:text-red-500"
          >
            <Trash2 size={13} strokeWidth={1.5} />
          </span>
          {expanded ? (
            <ChevronDown size={14} className="text-gray-400" />
          ) : (
            <ChevronRight size={14} className="text-gray-400" />
          )}
        </div>
      </button>

      {/* Expanded body */}
      {expanded && (
        <div className="space-y-4 border-t border-gray-100 p-4">
          <Field label="Phase title">
            <input
              type="text"
              value={phase.title}
              onChange={(e) => updatePhase(id, { title: e.target.value })}
              onMouseDown={stopCanvasEvent}
              onKeyDown={stopCanvasEvent}
              placeholder="e.g. Demolition"
              className={inputClass}
            />
          </Field>

          <div className="grid grid-cols-[2fr_1fr] gap-2">
            <Field label="Duration (display)">
              <input
                type="text"
                value={phase.estimatedDuration}
                onChange={(e) => updatePhase(id, { estimatedDuration: e.target.value })}
                onMouseDown={stopCanvasEvent}
                onKeyDown={stopCanvasEvent}
                placeholder='e.g. "2 weeks"'
                className={inputClass}
              />
            </Field>
            <Field label="Days">
              <input
                type="number"
                min={0}
                value={phase.estimatedDays ?? ''}
                onChange={(e) =>
                  updatePhase(id, {
                    estimatedDays: e.target.value === '' ? null : Number(e.target.value),
                  })
                }
                onMouseDown={stopCanvasEvent}
                onKeyDown={stopCanvasEvent}
                placeholder="14"
                className={inputClass}
              />
            </Field>
          </div>

          <Field label="Photo documentation">
            <select
              value={phase.photoDocumentation}
              onChange={(e) =>
                updatePhase(id, {
                  photoDocumentation: e.target.value as PhotoDocumentation,
                })
              }
              onMouseDown={stopCanvasEvent}
              onKeyDown={stopCanvasEvent}
              className={inputClass}
            >
              {(Object.entries(PHOTO_DOC_LABELS) as [PhotoDocumentation, string][]).map(
                ([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ),
              )}
            </select>
          </Field>

          <Field label="Client-facing description" hint="Shown on the portal timeline.">
            <textarea
              value={phase.description}
              onChange={(e) => updatePhase(id, { description: e.target.value })}
              onMouseDown={stopCanvasEvent}
              onKeyDown={stopCanvasEvent}
              placeholder="What the client will see about this phase"
              rows={2}
              className={cn(inputClass, 'resize-none')}
            />
          </Field>

          <div className="border-t border-gray-100 pt-3">
            <MilestoneEditor phaseId={id} milestones={phase.milestones} />
          </div>

          <div className="border-t border-gray-100 pt-3">
            <DecisionEditor phaseId={id} milestones={phase.milestones} />
          </div>
        </div>
      )}

      {/* Outgoing handle (bottom) */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-3 !w-3 !border-2 !border-white !bg-brand-teal-300 hover:!scale-130"
      />
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-semibold tracking-wider text-gray-500 uppercase">
        {label}
      </span>
      {children}
      {hint && <p className="mt-0.5 text-[10px] text-gray-400">{hint}</p>}
    </label>
  );
}

const inputClass =
  'block w-full rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-900 placeholder:text-gray-400 focus:border-brand-teal-300 focus:outline-none focus:ring-2 focus:ring-brand-teal-200';

function stopCanvasEvent(e: React.SyntheticEvent) {
  e.stopPropagation();
}

export const PhaseNode = memo(PhaseNodeImpl);
