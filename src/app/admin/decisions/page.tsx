import { requireAdmin } from '@/lib/auth/current-user';
import { DecisionsClient } from './DecisionsClient';
import { getPendingDecisions } from './queries';

export default async function DecisionsPage() {
  await requireAdmin();
  const rows = await getPendingDecisions();

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <h1 className="font-display text-brand-teal-500 text-3xl">Decisions</h1>
        {rows.length > 0 && (
          <span className="bg-brand-gold-400 rounded-full px-3 py-1 text-sm font-medium text-white">
            {rows.length}
          </span>
        )}
      </header>

      <DecisionsClient rows={rows} />
    </div>
  );
}
