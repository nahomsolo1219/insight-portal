import { requireAdmin } from '@/lib/auth/current-user';
import { DecisionsClient } from './DecisionsClient';
import { getPendingDecisions } from './queries';

export default async function DecisionsPage() {
  await requireAdmin();
  const rows = await getPendingDecisions();

  return (
    <div className="space-y-6">
      <header>
        <div className="mb-3 flex items-center gap-2">
          <span aria-hidden="true" className="bg-brand-gold-500 inline-block h-px w-8" />
          <span className="text-ink-500 text-[11px] font-medium uppercase tracking-[0.18em]">
            Awaiting client
          </span>
        </div>
        <div className="flex items-center gap-3">
          <h1 className="serif text-ink-900 text-3xl tracking-tight">Decisions</h1>
          {rows.length > 0 && (
            <span className="bg-brand-gold-400 rounded-full px-3 py-1 text-sm font-medium text-white">
              {rows.length}
            </span>
          )}
        </div>
      </header>

      <DecisionsClient rows={rows} />
    </div>
  );
}
