import Link from 'next/link';
import { requireAdmin } from '@/lib/auth/current-user';
import { cn } from '@/lib/utils';
import { DecisionsClient } from './DecisionsClient';
import { PastDecisionsClient } from './PastDecisionsClient';
import {
  getPastDecisionClients,
  getPastDecisions,
  getPendingDecisions,
  type PastDecisionSort,
} from './queries';

type View = 'awaiting' | 'past';

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
  const view: View = rawView === 'past' ? 'past' : 'awaiting';
  const sort: PastDecisionSort =
    rawSort === 'oldest' ? 'oldest' : rawSort === 'client' ? 'client' : 'newest';

  if (view === 'past') {
    const [rows, clientOptions] = await Promise.all([
      getPastDecisions({
        clientId: clientId || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        sort,
      }),
      getPastDecisionClients(),
    ]);

    return (
      <Shell view="past">
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

  const rows = await getPendingDecisions();
  return (
    <Shell view="awaiting" awaitingCount={rows.length}>
      <DecisionsClient rows={rows} />
    </Shell>
  );
}

function Shell({
  view,
  awaitingCount,
  children,
}: {
  view: View;
  awaitingCount?: number;
  children: React.ReactNode;
}) {
  const eyebrow = view === 'past' ? 'Audit' : 'Awaiting client';

  return (
    <div className="space-y-6">
      <header>
        <div className="mb-3 flex items-center gap-2">
          <span aria-hidden="true" className="bg-brand-gold-500 inline-block h-px w-8" />
          <span className="text-ink-500 text-[11px] font-medium tracking-[0.18em] uppercase">
            {eyebrow}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <h1 className="text-ink-900 text-3xl font-light tracking-tight">Decisions</h1>
          {view === 'awaiting' && awaitingCount && awaitingCount > 0 ? (
            <span className="bg-brand-gold-400 rounded-full px-3 py-1 text-sm font-medium text-white">
              {awaitingCount}
            </span>
          ) : null}
        </div>
      </header>

      <Tabs active={view} />

      {children}
    </div>
  );
}

function Tabs({ active }: { active: View }) {
  const tabBase =
    'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium whitespace-nowrap transition-all';
  const activeCls = 'shadow-soft text-brand-teal-500 bg-paper';
  const inactiveCls = 'text-ink-500 hover:text-brand-teal-500';

  return (
    <div className="bg-brand-warm-200 inline-flex gap-1 rounded-xl p-1">
      <Link
        href="/admin/decisions?view=awaiting"
        className={cn(tabBase, active === 'awaiting' ? activeCls : inactiveCls)}
      >
        Awaiting client
      </Link>
      <Link
        href="/admin/decisions?view=past"
        className={cn(tabBase, active === 'past' ? activeCls : inactiveCls)}
      >
        Past decisions
      </Link>
    </div>
  );
}
