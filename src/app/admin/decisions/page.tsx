import Link from 'next/link';
import { requireAdmin } from '@/lib/auth/current-user';
import { cn } from '@/lib/utils';
import { DecisionsClient } from './DecisionsClient';
import { NeedsReviewClient } from './NeedsReviewClient';
import { PastDecisionsClient } from './PastDecisionsClient';
import {
  getDecisionsAwaitingReview,
  getDecisionTabCounts,
  getPastDecisionClients,
  getPastDecisions,
  getPendingDecisions,
  type DecisionTabCounts,
  type PastDecisionSort,
} from './queries';

type View = 'awaiting' | 'review' | 'past';

interface PageProps {
  searchParams: Promise<{
    view?: string;
    clientId?: string;
    startDate?: string;
    endDate?: string;
    sort?: string;
  }>;
}

export default async function DecisionsPage({ searchParams }: PageProps) {
  await requireAdmin();
  const { view: rawView, clientId, startDate, endDate, sort: rawSort } = await searchParams;
  const view: View =
    rawView === 'past' ? 'past' : rawView === 'review' ? 'review' : 'awaiting';
  const sort: PastDecisionSort =
    rawSort === 'oldest' ? 'oldest' : rawSort === 'client' ? 'client' : 'newest';

  if (view === 'review') {
    const [rows, counts] = await Promise.all([
      getDecisionsAwaitingReview(),
      getDecisionTabCounts(),
    ]);
    return (
      <Shell view="review" counts={counts}>
        <NeedsReviewClient rows={rows} />
      </Shell>
    );
  }

  if (view === 'past') {
    const [rows, clientOptions, counts] = await Promise.all([
      getPastDecisions({
        clientId: clientId || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        sort,
      }),
      getPastDecisionClients(),
      getDecisionTabCounts(),
    ]);

    return (
      <Shell view="past" counts={counts}>
        <PastDecisionsClient
          rows={rows}
          clientOptions={clientOptions}
          filters={{
            clientId: clientId ?? '',
            startDate: startDate ?? '',
            endDate: endDate ?? '',
            sort,
          }}
        />
      </Shell>
    );
  }

  const [rows, counts] = await Promise.all([
    getPendingDecisions(),
    getDecisionTabCounts(),
  ]);
  return (
    <Shell view="awaiting" counts={counts}>
      <DecisionsClient rows={rows} />
    </Shell>
  );
}

function Shell({
  view,
  counts,
  children,
}: {
  view: View;
  counts: DecisionTabCounts;
  children: React.ReactNode;
}) {
  const eyebrow =
    view === 'past' ? 'Audit' : view === 'review' ? 'Needs your review' : 'Awaiting client';

  return (
    <div className="space-y-6">
      <header>
        <div className="mb-3 flex items-center gap-2">
          <span aria-hidden="true" className="bg-brand-gold-500 inline-block h-px w-8" />
          <span className="text-ink-500 text-[11px] font-medium tracking-[0.18em] uppercase">
            {eyebrow}
          </span>
        </div>
        <h1 className="text-ink-900 text-3xl font-light tracking-tight">Decisions</h1>
      </header>

      <Tabs active={view} counts={counts} />

      {children}
    </div>
  );
}

function Tabs({ active, counts }: { active: View; counts: DecisionTabCounts }) {
  return (
    <div className="bg-brand-warm-200 inline-flex max-w-full gap-1 overflow-x-auto rounded-xl p-1">
      <TabLink
        href="/admin/decisions?view=awaiting"
        label="Awaiting client"
        count={counts.awaiting}
        active={active === 'awaiting'}
        countTone="gold"
      />
      <TabLink
        href="/admin/decisions?view=review"
        label="Needs your review"
        count={counts.review}
        active={active === 'review'}
        countTone="amber"
      />
      <TabLink
        href="/admin/decisions?view=past"
        label="Past decisions"
        active={active === 'past'}
      />
    </div>
  );
}

function TabLink({
  href,
  label,
  count,
  active,
  countTone,
}: {
  href: string;
  label: string;
  count?: number;
  active: boolean;
  countTone?: 'gold' | 'amber';
}) {
  const showCount = typeof count === 'number' && count > 0;
  return (
    <Link
      href={href}
      className={cn(
        'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium whitespace-nowrap transition-all',
        active ? 'shadow-soft text-brand-teal-500 bg-paper' : 'text-ink-500 hover:text-brand-teal-500',
      )}
    >
      {label}
      {showCount && (
        <span
          className={cn(
            'inline-flex min-w-[20px] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
            countTone === 'amber'
              ? 'bg-amber-100 text-amber-700'
              : 'bg-brand-gold-100 text-brand-gold-700',
          )}
        >
          {count}
        </span>
      )}
    </Link>
  );
}
