'use client';

import { Check } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { LoadingDots } from '@/components/admin/LoadingDots';
import { useToast } from '@/components/admin/ToastProvider';
import { respondToDecision } from '@/app/portal/p/[propertyId]/projects/[id]/actions';
import { cn } from '@/lib/utils';
import type {
  DecisionType,
  PortalDecisionOption,
} from '@/app/portal/p/[propertyId]/projects/[id]/queries';

export interface DecisionResponderProps {
  milestoneId: string;
  questionType: DecisionType | null;
  options: PortalDecisionOption[];
  /** Layout variant. `'timeline'` keeps the legacy in-line look used on
   *  the project detail page; `'editorial'` strips visual chrome so the
   *  dashboard's Featured Decision wrapper provides the surrounding card.
   *  Both share the same submit logic and server action — only the
   *  response-control rendering differs. */
  variant?: 'timeline' | 'editorial';
  /** Optional class merged into the root container — convenience for the
   *  editorial wrapper to drop the inherited `mt-4` spacing. */
  className?: string;
}

/**
 * The interactive piece of a client decision: posts to `respondToDecision`
 * with the response payload appropriate to the milestone's `questionType`.
 *
 * Rendering branches by question type:
 *   - acknowledge → single CTA button
 *   - approval → Approve / Request changes pair
 *   - open → textarea + Submit
 *   - single / multi (or fallback) → tile grid + confirm flow
 *
 * Cover-swatch behaviour: the option grid honours `option.imageUrl` when
 * the variant is `'timeline'` (the project detail surface that pre-dates
 * Phase 2B-1) and ignores images entirely on `'editorial'` (the
 * dashboard surface where production decisions are intentionally text-
 * only). Same component, two reads.
 */
export function DecisionResponder({
  milestoneId,
  questionType,
  options,
  variant = 'timeline',
  className,
}: DecisionResponderProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState<string | null>(null);
  const [openText, setOpenText] = useState('');
  // Optimistic transition. On a successful submit we flip to a local
  // "submitted" view immediately so the form disappears even before
  // the server roundtrip + revalidate land. The query layer
  // (getPropertyDashboardData / portal badge counts) now filters
  // responded decisions out, so once the data refreshes the parent
  // either swaps to a different decision or unmounts this component
  // entirely. Until then this thank-you card is what the client sees
  // — much less jarring than re-rendering the question form for the
  // half-second it takes the layout cache to flush.
  const [submittedResponse, setSubmittedResponse] = useState<string | null>(null);

  const isEditorial = variant === 'editorial';

  function submit(response: string) {
    startTransition(async () => {
      const result = await respondToDecision(milestoneId, response);
      if (!result.success) {
        showToast(result.error, 'error');
        return;
      }
      showToast('Response sent');
      // Optimistically swap to the "received" state. router.refresh
      // still fires so the underlying query reruns, the decision
      // drops out of the featured/badge counts, and (on the project
      // timeline) the parent renders RespondedSummary on next paint.
      setSubmittedResponse(response);
      router.refresh();
    });
  }

  // Local "thanks, we got it" view once the user has submitted.
  // Renders identically across all questionType branches — the
  // surrounding decision card / FeaturedDecisionCard handles the
  // larger layout, this component just owns its own slot.
  if (submittedResponse) {
    return (
      <div
        className={cn(
          'flex items-start gap-3 rounded-xl px-4 py-3 text-sm',
          isEditorial
            ? 'bg-cream border-line text-ink-700 border'
            : 'bg-emerald-50 text-emerald-700',
          !isEditorial && 'mt-4',
          className,
        )}
        role="status"
        aria-live="polite"
      >
        <Check
          size={16}
          strokeWidth={2}
          className={cn(
            'mt-0.5 flex-shrink-0',
            isEditorial ? 'text-[var(--amber-600)]' : 'text-emerald-600',
          )}
        />
        <div className="flex-1">
          <p className={cn('font-medium', isEditorial && 'text-ink-900')}>
            Response received
          </p>
          <p
            className={cn(
              'mt-0.5 text-xs',
              isEditorial ? 'text-ink-500' : 'text-emerald-700/80',
            )}
          >
            Thanks — your project manager has been notified.
          </p>
        </div>
      </div>
    );
  }

  if (questionType === 'acknowledge') {
    return (
      <button
        type="button"
        onClick={() => submit('Acknowledged')}
        disabled={isPending}
        className={cn(
          isEditorial ? amberCtaClass : tealCtaClass,
          isEditorial ? null : 'mt-4',
          className,
        )}
      >
        {isPending ? (
          <>
            Sending
            <LoadingDots />
          </>
        ) : (
          "I've reviewed this"
        )}
      </button>
    );
  }

  if (questionType === 'approval') {
    return (
      <div className={cn('flex flex-col gap-2 sm:flex-row', !isEditorial && 'mt-4', className)}>
        <button
          type="button"
          onClick={() => submit('Approved')}
          disabled={isPending}
          className={cn(
            'inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl text-sm font-medium transition-all disabled:cursor-not-allowed disabled:opacity-60',
            isEditorial ? amberFillClass : tealFillClass,
          )}
        >
          {isPending ? <LoadingDots /> : 'Approve'}
        </button>
        <button
          type="button"
          onClick={() => submit('Decline')}
          disabled={isPending}
          className={cn(
            'inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl text-sm font-medium transition-all disabled:cursor-not-allowed disabled:opacity-60',
            isEditorial
              ? 'border-line text-ink-700 hover:bg-cream border'
              : 'border border-gray-200 text-gray-700 hover:bg-gray-50',
          )}
        >
          {isEditorial ? 'Decline' : 'Request changes'}
        </button>
      </div>
    );
  }

  if (questionType === 'open') {
    return (
      <div className={cn('space-y-3', !isEditorial && 'mt-4', className)}>
        <textarea
          value={openText}
          onChange={(e) => setOpenText(e.target.value)}
          rows={3}
          placeholder={isEditorial ? 'Share your thoughts…' : 'Type your response...'}
          className={cn(
            'w-full resize-none rounded-xl px-4 py-3 text-sm transition-all focus:outline-none',
            isEditorial
              ? 'bg-cream border-line text-ink-900 focus:border-[var(--amber-500)] focus:ring-2 focus:ring-[var(--amber-100)] border'
              : 'focus:ring-brand-teal-200 focus:border-brand-teal-300 border border-gray-200 text-gray-900 focus:ring-2',
          )}
        />
        <button
          type="button"
          onClick={() => submit(openText)}
          disabled={isPending || !openText.trim()}
          className={cn(
            'inline-flex h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-medium transition-all disabled:cursor-not-allowed disabled:opacity-60',
            isEditorial ? amberFillClass : tealFillClass,
          )}
        >
          {isPending ? (
            <>
              Sending
              <LoadingDots />
            </>
          ) : (
            'Send'
          )}
        </button>
      </div>
    );
  }

  // single / multi / fallback — tile grid.
  if (options.length === 0) {
    return (
      <p
        className={cn(
          'text-sm italic',
          isEditorial ? 'text-ink-500' : 'text-gray-500',
          !isEditorial && 'mt-3',
          className,
        )}
      >
        Your project manager hasn&apos;t finalised the options yet — check back soon.
      </p>
    );
  }

  return (
    <div className={cn('space-y-3', !isEditorial && 'mt-4', className)}>
      <div
        className={cn(
          'grid gap-3',
          // Two columns on mobile keep the labels readable; three on
          // wider viewports matches both the 900px portal column and
          // the 1100px editorial dashboard.
          'grid-cols-2 md:grid-cols-3',
        )}
      >
        {options.map((opt, i) => {
          const isSelected = selected === opt.label;
          return (
            <button
              key={`${opt.label}-${i}`}
              type="button"
              onClick={() => setSelected(opt.label)}
              disabled={isPending}
              className={cn(
                'group flex min-h-[44px] flex-col overflow-hidden rounded-xl border text-left transition-all',
                isEditorial
                  ? cn(
                      'bg-cream',
                      isSelected
                        ? 'ring-2 ring-[var(--amber-500)] border-[var(--amber-500)] bg-[var(--amber-50)]'
                        : 'border-line hover:border-line-2',
                    )
                  : cn(
                      'bg-white',
                      isSelected
                        ? 'border-brand-teal-500 ring-2 ring-brand-teal-200'
                        : 'border-gray-200 hover:border-brand-teal-300',
                    ),
                isPending && 'opacity-60',
              )}
            >
              {/* Cover swatches only render on the project-timeline surface.
                   Production dashboard decisions are text-only per Phase 2B-1. */}
              {!isEditorial && opt.imageUrl && (
                <div className="aspect-[4/3] w-full overflow-hidden bg-gray-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={opt.imageUrl}
                    alt={opt.label}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                </div>
              )}
              <div className="flex-1 p-3">
                <div
                  className={cn(
                    isEditorial
                      ? 'text-ink-900 text-base font-light tracking-tight'
                      : 'text-sm font-medium text-gray-900',
                  )}
                >
                  {opt.label || 'Option'}
                </div>
                {opt.description && (
                  <div
                    className={cn(
                      'mt-1 text-xs',
                      isEditorial ? 'text-ink-500' : 'text-gray-500',
                    )}
                  >
                    {opt.description}
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {selected && (
        <div
          className={cn(
            'flex flex-col gap-2 rounded-xl p-3 sm:flex-row sm:items-center sm:justify-between',
            isEditorial ? 'bg-cream border-line border' : 'bg-brand-warm-50',
          )}
        >
          <p className={cn('text-sm', isEditorial ? 'text-ink-700' : 'text-gray-700')}>
            You selected{' '}
            <strong className={cn('font-semibold', isEditorial && 'text-ink-900')}>
              {selected}
            </strong>
            . Confirm{questionType === 'multi' ? ' choice' : ' choice'}?
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setSelected(null)}
              disabled={isPending}
              className={cn(
                'rounded-lg px-3 py-2 text-xs font-medium transition-all',
                isEditorial
                  ? 'text-ink-500 hover:bg-paper'
                  : 'text-gray-500 hover:bg-white',
              )}
            >
              Change
            </button>
            <button
              type="button"
              onClick={() => submit(selected)}
              disabled={isPending}
              className={cn(
                'inline-flex items-center gap-1 rounded-lg px-4 py-2 text-xs font-medium transition-all disabled:cursor-not-allowed disabled:opacity-60',
                isEditorial ? amberFillClass : tealFillClass,
              )}
            >
              {isPending ? (
                <>
                  Sending
                  <LoadingDots />
                </>
              ) : questionType === 'multi' ? (
                'Confirm choices'
              ) : (
                'Confirm choice'
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Class strings — kept module-local so callers don't compose them inline.
// ---------------------------------------------------------------------------

const amberCtaClass =
  'text-paper inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[var(--amber-500)] px-6 text-sm font-medium transition-all hover:bg-[var(--amber-600)] disabled:cursor-not-allowed disabled:opacity-60';

const amberFillClass =
  'text-paper bg-[var(--amber-500)] hover:bg-[var(--amber-600)]';

const tealCtaClass =
  'bg-brand-teal-500 hover:bg-brand-teal-600 inline-flex h-11 items-center justify-center gap-2 rounded-xl px-6 text-sm font-medium text-white shadow-soft transition-all disabled:cursor-not-allowed disabled:opacity-60';

const tealFillClass =
  'bg-brand-teal-500 hover:bg-brand-teal-600 text-white shadow-soft';
