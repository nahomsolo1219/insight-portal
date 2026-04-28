'use client';

import { Eye, Save, X } from 'lucide-react';
import { LoadingDots } from '@/components/admin/LoadingDots';
import { cn } from '@/lib/utils';
import type { BuilderPhase } from '../builder-types';

type TemplateType = 'maintenance' | 'remodel';

interface Props {
  name: string;
  onNameChange: (value: string) => void;
  type: TemplateType;
  onTypeChange: (value: TemplateType) => void;
  phases: BuilderPhase[];
  isSaving: boolean;
  onSave: () => void;
  onPreview: () => void;
  onCancel: () => void;
}

export function BuilderToolbar({
  name,
  onNameChange,
  type,
  onTypeChange,
  phases,
  isSaving,
  onSave,
  onPreview,
  onCancel,
}: Props) {
  const milestoneCount = phases.reduce(
    (sum, p) => sum + p.milestones.filter((m) => !m.isDecisionPoint).length,
    0,
  );
  const decisionCount = phases.reduce(
    (sum, p) => sum + p.milestones.filter((m) => m.isDecisionPoint).length,
    0,
  );
  const totalDays = phases.reduce((sum, p) => sum + (p.estimatedDays ?? 0), 0);
  const weeks = totalDays > 0 ? Math.round(totalDays / 7) : null;

  return (
    <div className="shadow-elevated flex items-center gap-4 rounded-2xl border border-line-2 bg-paper px-5 py-3">
      <div className="min-w-[240px]">
        <input
          type="text"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="Untitled template"
          className="w-full rounded-lg bg-transparent px-1 py-0.5 text-sm font-semibold text-gray-900 placeholder:text-gray-400 focus:bg-brand-warm-50 focus:outline-none"
        />
        <div className="mt-0.5 text-[11px] text-gray-500">
          {phases.length} {phases.length === 1 ? 'phase' : 'phases'}
          {' · '}
          {milestoneCount} {milestoneCount === 1 ? 'milestone' : 'milestones'}
          {decisionCount > 0 && (
            <>
              {' · '}
              {decisionCount} {decisionCount === 1 ? 'decision' : 'decisions'}
            </>
          )}
          {weeks !== null && (
            <>
              {' · '}~{weeks} {weeks === 1 ? 'week' : 'weeks'}
            </>
          )}
        </div>
      </div>

      <div className="h-8 w-px bg-gray-200" />

      <div className="bg-brand-warm-200 inline-flex gap-1 rounded-lg p-1">
        {(['maintenance', 'remodel'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => onTypeChange(t)}
            className={cn(
              'rounded-md px-3 py-1 text-xs font-medium transition-all',
              t === type
                ? 'shadow-soft text-brand-teal-500 bg-paper'
                : 'hover:text-brand-teal-500 text-gray-500',
            )}
          >
            {t === 'maintenance' ? 'Maintenance' : 'Remodel'}
          </button>
        ))}
      </div>

      <div className="flex flex-1 items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-gray-500 transition-all hover:bg-gray-100"
        >
          <X size={12} strokeWidth={2} />
          Cancel
        </button>
        <button
          type="button"
          onClick={onPreview}
          className="border-brand-teal-200 text-brand-teal-500 hover:bg-brand-teal-50 inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all"
        >
          <Eye size={12} strokeWidth={2} />
          Preview
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={isSaving}
          className="bg-brand-gold-400 hover:bg-brand-gold-500 shadow-soft inline-flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-medium text-white transition-all disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Save size={12} strokeWidth={2} />
          {isSaving ? (
            <>
              Saving
              <LoadingDots />
            </>
          ) : (
            'Save'
          )}
        </button>
      </div>
    </div>
  );
}
