'use client';

import { AlertCircle, Camera, Check, Clock } from 'lucide-react';
import { Modal } from '@/components/admin/Modal';
import { cn } from '@/lib/utils';
import type { BuilderPhase, PhotoDocumentation } from '../builder-types';

const PHOTO_DOC_LABELS: Record<PhotoDocumentation, string> = {
  none: 'No photos',
  before_after: 'Before + After',
  before_during_after: 'Before + During + After',
  during_only: 'During',
};

interface Props {
  name: string;
  phases: BuilderPhase[];
  onClose: () => void;
}

/**
 * Client-facing timeline preview. Walks the phases in order and renders
 * each as a card with its milestones + decisions. For feedback on spacing
 * we fake-stage the first phase as complete, the second in-progress, the
 * rest upcoming — matches what the real portal will show once phases land
 * against real project data.
 */
export function TemplatePreview({ name, phases, onClose }: Props) {
  const totalDays = phases.reduce((sum, p) => sum + (p.estimatedDays ?? 0), 0);
  const weeks = totalDays > 0 ? Math.round(totalDays / 7) : null;

  return (
    <Modal open onClose={onClose} title="Client preview" size="lg">
      <div className="bg-brand-teal-500 -m-6 mb-6 px-6 py-6 text-white">
        <h2 className="text-2xl font-light tracking-tight">{name || 'Untitled template'}</h2>
        <div className="mt-2 text-xs text-white/70">
          {phases.length} {phases.length === 1 ? 'phase' : 'phases'}
          {weeks !== null && (
            <>
              {' · '}~{weeks} {weeks === 1 ? 'week' : 'weeks'}
            </>
          )}
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-paper/10">
          <div
            className="bg-brand-gold-400 h-full rounded-full transition-all"
            style={{
              width:
                phases.length === 0
                  ? '0%'
                  : `${Math.round(((1 + 0.5) / phases.length) * 100)}%`,
            }}
          />
        </div>
      </div>

      {phases.length === 0 ? (
        <div className="p-8 text-center text-sm text-gray-400">
          Add a phase to see the client view.
        </div>
      ) : (
        <div className="relative space-y-5 pl-8">
          <div className="absolute top-2 bottom-2 left-3 w-px border-l border-dashed border-line" />
          {phases.map((phase, i) => {
            const status: Status = i === 0 ? 'complete' : i === 1 ? 'active' : 'upcoming';
            return <PhasePreviewCard key={phase.id} phase={phase} number={i + 1} status={status} />;
          })}
        </div>
      )}
    </Modal>
  );
}

type Status = 'complete' | 'active' | 'upcoming';

function PhasePreviewCard({
  phase,
  number,
  status,
}: {
  phase: BuilderPhase;
  number: number;
  status: Status;
}) {
  const regular = phase.milestones.filter((m) => !m.isDecisionPoint);
  const decisions = phase.milestones.filter((m) => m.isDecisionPoint);

  return (
    <div className="relative">
      {/* Timeline dot */}
      <div
        className={cn(
          'absolute -left-[22px] top-2 flex h-4 w-4 items-center justify-center rounded-full',
          status === 'complete' && 'bg-brand-teal-500',
          status === 'active' && 'border-2 border-brand-gold-400 bg-paper',
          status === 'upcoming' && 'border border-gray-300 bg-paper',
        )}
      >
        {status === 'complete' && <Check size={10} strokeWidth={3} className="text-white" />}
      </div>

      <div
        className={cn(
          'shadow-soft-md rounded-xl bg-paper p-4',
          status === 'active' && 'border-brand-gold-300 border',
          status === 'upcoming' && 'opacity-70',
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="mb-0.5 text-[10px] font-semibold tracking-wider text-gray-400 uppercase">
              Phase {number}
              {status === 'active' && <span className="text-brand-gold-500"> · In progress</span>}
              {status === 'complete' && <span className="text-brand-teal-500"> · Complete</span>}
            </div>
            <h3 className="text-sm font-semibold text-gray-900">
              {phase.title || 'Untitled phase'}
            </h3>
            {phase.description && (
              <p className="mt-1 text-xs text-gray-500">{phase.description}</p>
            )}
          </div>
          {phase.estimatedDuration && (
            <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-md bg-gray-50 px-2 py-0.5 text-[10px] text-gray-500">
              <Clock size={10} strokeWidth={1.5} />
              {phase.estimatedDuration}
            </span>
          )}
        </div>

        {regular.length > 0 && (
          <ul className="mt-3 space-y-1">
            {regular.map((m) => (
              <li key={m.id} className="flex items-start gap-2 text-xs text-gray-700">
                <span className="bg-brand-teal-50 mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full" />
                <span className="min-w-0">{m.title || 'Untitled milestone'}</span>
              </li>
            ))}
          </ul>
        )}

        {decisions.map((d) => {
          const hasAnyImage = d.decisionOptions.some((o) => o.imageUrl);
          return (
            <div
              key={d.id}
              className="mt-3 rounded-lg border border-pink-100 bg-pink-50/50 p-3 text-xs"
            >
              <div className="inline-flex items-center gap-1.5 text-[10px] font-semibold tracking-wider text-pink-700 uppercase">
                <AlertCircle size={10} strokeWidth={2} />
                Decision required
              </div>
              <div className="mt-1 text-sm font-medium text-gray-900">
                {d.decisionQuestion || 'Unnamed decision'}
              </div>

              {d.decisionOptions.length > 0 &&
                (hasAnyImage ? (
                  // Visual cards: use a 2-col grid so even a phone-width
                  // preview keeps thumbnails legible. Options without an
                  // image show a neutral placeholder so the grid stays
                  // even-sized.
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {d.decisionOptions.map((opt, i) => (
                      <div
                        key={i}
                        className="hover:border-brand-gold-400 overflow-hidden rounded-xl border border-line bg-paper text-left transition-all"
                      >
                        <div className="aspect-[4/3] w-full overflow-hidden bg-gray-100">
                          {opt.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={opt.imageUrl}
                              alt={opt.label || 'Option image'}
                              className="h-full w-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-gray-300">
                              <span className="text-[10px] uppercase tracking-wider">No image</span>
                            </div>
                          )}
                        </div>
                        <div className="p-2.5">
                          <p className="text-[12px] font-medium text-gray-900">
                            {opt.label || 'Untitled'}
                          </p>
                          {opt.description && (
                            <p className="mt-0.5 text-[10px] text-gray-500">{opt.description}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  // No images on any option — fall back to text chips.
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {d.decisionOptions.map((opt, i) => (
                      <span
                        key={i}
                        className="rounded-md border border-line bg-paper px-2 py-0.5 text-[11px] text-gray-700"
                      >
                        {opt.label || 'Untitled'}
                      </span>
                    ))}
                  </div>
                ))}
            </div>
          );
        })}

        {phase.photoDocumentation !== 'none' && (
          <div className="mt-3 inline-flex items-center gap-1 text-[10px] text-gray-400">
            <Camera size={10} strokeWidth={1.5} />
            Photos: {PHOTO_DOC_LABELS[phase.photoDocumentation]}
          </div>
        )}
      </div>
    </div>
  );
}
