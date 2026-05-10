// Read-only summary of maintenance plans for a single client. Lists
// every plan across every property they own and links each card to
// the canonical detail page under /admin/maintenance/[id].
//
// Server Component — no client-side state, just `await
// listPlansForClient` and render. Per spec, this tab does NOT
// duplicate the create/edit affordances; admin always reaches the
// builder via the sidebar nav so plan creation has one home.

import { ChevronRight, Wrench } from 'lucide-react';
import Link from 'next/link';
import { listPlansForClient } from '@/lib/maintenance/queries';
import { cn, formatCurrency, formatDate } from '@/lib/utils';

interface MaintenanceTabProps {
  clientId: string;
}

export async function MaintenanceTab({ clientId }: MaintenanceTabProps) {
  const plans = await listPlansForClient(clientId);

  if (plans.length === 0) {
    return (
      <div className="shadow-soft-md rounded-2xl bg-paper p-12 text-center">
        <div className="bg-cream mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full text-ink-400">
          <Wrench size={20} strokeWidth={1.5} />
        </div>
        <h2 className="text-ink-900 text-base font-semibold">No maintenance plans</h2>
        <p className="text-ink-500 mx-auto mt-2 max-w-sm text-sm">
          Build a plan from <Link href="/admin/maintenance" className="text-brand-teal-500 hover:underline">Maintenance</Link>.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {plans.map((p) => (
        <Link
          key={p.id}
          href={`/admin/maintenance/${p.id}`}
          className="shadow-soft-md group block rounded-2xl bg-paper p-5 transition-shadow hover:shadow-soft-lg"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-ink-900 text-base font-medium">{p.name}</h3>
                <PlanStatusBadge status={p.status} />
              </div>
              <div className="mt-1 text-sm text-ink-500">{p.propertyName}</div>
              <div className="mt-1 text-xs text-ink-400 tabular-nums">
                {formatDate(p.startDate)} → {formatDate(p.endDate)}
              </div>
            </div>
            <div className="flex items-center gap-6">
              <div className="text-right">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">
                  Visits
                </div>
                <div className="text-ink-900 mt-0.5 text-sm tabular-nums">
                  {p.completedVisitCount} / {p.visitCount}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">
                  Billing
                </div>
                <div className="text-ink-900 mt-0.5 text-sm tabular-nums">
                  {p.billingTotalCents != null ? formatCurrency(p.billingTotalCents) : '—'}
                </div>
              </div>
              <ChevronRight size={16} strokeWidth={1.5} className="text-ink-300 group-hover:text-ink-500" />
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

function PlanStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; classes: string }> = {
    active: { label: 'Active', classes: 'bg-emerald-50 text-emerald-700' },
    draft: { label: 'Draft', classes: 'bg-gray-100 text-gray-600' },
    completed: { label: 'Completed', classes: 'bg-blue-50 text-blue-700' },
    archived: { label: 'Archived', classes: 'bg-amber-50 text-amber-700' },
  };
  const tone = map[status] ?? { label: status, classes: 'bg-gray-100 text-gray-600' };
  return (
    <span
      className={cn(
        'rounded-full px-2 py-0.5 text-[10px] font-medium tracking-wide',
        tone.classes,
      )}
    >
      {tone.label}
    </span>
  );
}
