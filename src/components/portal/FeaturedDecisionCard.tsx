import { DecisionResponder } from '@/components/portal/DecisionResponder';
import type { FeaturedDecision } from '@/app/portal/p/[propertyId]/dashboard/queries';

interface FeaturedDecisionCardProps {
  decision: FeaturedDecision;
  /** Pulled from the hero/query layer; drives the footer hint copy. */
  pendingDecisionCount: number;
}

/**
 * Editorial wrapper around the shared DecisionResponder for the
 * dashboard's headline "thing that needs you" card.
 *
 * Visual structure (matches the Phase 2B-1 mockup):
 *   - Eyebrow row — amber hairline rule + "DECISION · {projectName}" label
 *   - Fraunces headline — the decision question text
 *   - Body — the milestone notes (or a generic line)
 *   - Response controls — DecisionResponder, editorial variant
 *   - Optional footer hint — only when there are siblings worth surfacing
 *
 * The card is anchored by `id="featured-decision"` so the header bell's
 * smooth-scroll target works.
 */
export function FeaturedDecisionCard({
  decision,
  pendingDecisionCount,
}: FeaturedDecisionCardProps) {
  // Headline preference: questionBody (admin-authored question text) when
  // present; fall back to the milestone title so legacy rows that pre-date
  // the dedicated question_body column still render coherently.
  const headline = decision.questionBody?.trim() || decision.title;
  const lede = decision.notes?.trim()
    || 'Take a look — let us know when you’ve decided.';

  const otherCount = pendingDecisionCount - 1;

  return (
    <section
      id="featured-decision"
      aria-labelledby="featured-decision-heading"
      className="bg-paper border-line rounded-2xl border p-6 sm:p-8"
      style={{ boxShadow: 'var(--shadow-soft-md)' }}
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="inline-block h-px w-8"
          style={{ backgroundColor: 'var(--amber-500)' }}
        />
        <span className="text-ink-500 text-[11px] font-medium uppercase tracking-[0.18em]">
          {decision.projectName
            ? `Decision · ${decision.projectName}`
            : 'Decision'}
        </span>
      </div>

      <h2
        id="featured-decision-heading"
        className="serif text-ink-900 mt-3 text-2xl leading-tight sm:text-3xl"
      >
        {headline}
      </h2>

      <p className="text-ink-500 mt-3 text-base leading-relaxed">{lede}</p>

      <div className="mt-6">
        <DecisionResponder
          milestoneId={decision.id}
          questionType={decision.questionType}
          options={decision.options}
          variant="editorial"
        />
      </div>

      {otherCount > 0 && (
        <p className="text-ink-400 mt-6 text-xs italic">
          {otherCount === 1
            ? '1 more decision is waiting elsewhere — check the project list when you’re ready.'
            : `${otherCount} more decisions are waiting elsewhere — check the project list when you’re ready.`}
        </p>
      )}
    </section>
  );
}
