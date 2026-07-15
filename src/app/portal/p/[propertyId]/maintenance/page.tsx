import {
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Download,
  FileText,
  MapPin,
  ShieldCheck,
} from 'lucide-react';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/current-user';
import { resolveScopeLabel, getScopeType } from '@/lib/maintenance/scope-types';
import { cn, formatDate } from '@/lib/utils';
import {
  getActiveMaintenancePlans,
  getPastMaintenancePlans,
  getPlanDocumentUrls,
  type MaintenancePlanRow,
  type MaintenanceVisitRow,
} from './queries';

export default async function PortalMaintenancePage({
  params,
}: {
  params: Promise<{ propertyId: string }>;
}) {
  const { propertyId } = await params;
  const user = await getCurrentUser();
  if (!user || user.role !== 'client' || !user.clientId) redirect('/');

  const clientId = user.clientId;
  const [activePlans, pastPlans] = await Promise.all([
    getActiveMaintenancePlans(clientId, propertyId),
    getPastMaintenancePlans(clientId, propertyId),
  ]);

  // No plans at all — show empty state.
  if (activePlans.length === 0 && pastPlans.length === 0) {
    return <EmptyState />;
  }

  // Get document URLs for the first active plan (primary surface).
  const primaryPlan = activePlans[0] ?? null;
  const docUrls = primaryPlan
    ? await getPlanDocumentUrls(primaryPlan)
    : { homeAssessmentSignedUrl: null, playbookSignedUrl: null };

  return (
    <div className="mx-auto w-full max-w-[1200px] space-y-8">
      {/* Hero header */}
      <HeroHeader plan={primaryPlan} />

      {/* Active plans */}
      {activePlans.map((plan) => (
        <PlanSection key={plan.id} plan={plan} docUrls={plan.id === primaryPlan?.id ? docUrls : undefined} />
      ))}

      {/* Past plans toggle */}
      {pastPlans.length > 0 && <PastPlansSection plans={pastPlans} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hero header
// ---------------------------------------------------------------------------

function HeroHeader({ plan }: { plan: MaintenancePlanRow | null }) {
  const completedVisits = plan?.visits.filter((v) => v.status === 'completed').length ?? 0;
  const totalVisits = plan?.visits.length ?? 0;
  const nextVisit = plan?.visits.find((v) => v.status === 'scheduled' || v.status === 'in_progress');

  return (
    <header
      className="overflow-hidden rounded-2xl p-8 text-paper md:p-10"
      style={{ backgroundColor: 'var(--teal-900)' }}
    >
      <p className="text-paper/60 text-[11px] font-medium tracking-[0.18em] uppercase">
        {plan ? plan.name : 'Maintenance'}
      </p>
      <h1 className="mt-2 text-3xl font-light tracking-tight md:text-4xl">
        Maintenance
      </h1>
      {plan && (
        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-paper/80">
          <span className="inline-flex items-center gap-1.5">
            <CheckCircle2 size={14} strokeWidth={1.5} />
            {completedVisits} of {totalVisits} visits complete
          </span>
          {nextVisit && (
            <span className="inline-flex items-center gap-1.5">
              <CalendarClock size={14} strokeWidth={1.5} />
              Next: {formatShortDate(nextVisit.scheduledDate)}
            </span>
          )}
          <span className="inline-flex items-center gap-1.5">
            <Clock size={14} strokeWidth={1.5} />
            {formatDate(plan.startDate)} – {formatDate(plan.endDate)}
          </span>
        </div>
      )}
    </header>
  );
}

// ---------------------------------------------------------------------------
// Plan section with quarterly visit grouping
// ---------------------------------------------------------------------------

function PlanSection({
  plan,
  docUrls,
}: {
  plan: MaintenancePlanRow;
  docUrls?: { homeAssessmentSignedUrl: string | null; playbookSignedUrl: string | null };
}) {
  const grouped = groupVisitsByQuarter(plan.visits);

  return (
    <div className="space-y-6">
      {grouped.map((group) => (
        <section key={group.label}>
          <QuarterHeader label={group.label} season={group.season} />
          <div className="space-y-3">
            {group.visits.map((visit) => (
              <VisitCard key={visit.id} visit={visit} />
            ))}
          </div>
        </section>
      ))}

      {/* Documents section */}
      {docUrls && <DocumentsSection docUrls={docUrls} plan={plan} />}
    </div>
  );
}

interface QuarterGroup {
  label: string;
  season: string;
  visits: MaintenanceVisitRow[];
}

const QUARTER_SEASONS = ['WINTER', 'SPRING', 'SUMMER', 'FALL'] as const;

function groupVisitsByQuarter(visits: MaintenanceVisitRow[]): QuarterGroup[] {
  if (visits.length === 4) {
    // Standard quarterly grouping — one visit per quarter.
    return visits.map((visit, i) => ({
      label: `Q${i + 1}`,
      season: QUARTER_SEASONS[i] ?? '',
      visits: [visit],
    }));
  }

  // Non-standard count — group by visit order.
  if (visits.length === 0) return [];
  return visits.map((visit, i) => ({
    label: `Visit ${i + 1}`,
    season: '',
    visits: [visit],
  }));
}

function QuarterHeader({ label, season }: { label: string; season: string }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span
        aria-hidden="true"
        className="inline-block h-px w-6 flex-shrink-0"
        style={{ backgroundColor: 'var(--amber-500)' }}
      />
      <span className="text-ink-500 text-[11px] font-medium tracking-[0.18em] uppercase">
        {label}{season ? ` · ${season}` : ''}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Visit card
// ---------------------------------------------------------------------------

function VisitCard({ visit }: { visit: MaintenanceVisitRow }) {
  const statusConfig = VISIT_STATUS_MAP[visit.status] ?? VISIT_STATUS_MAP.scheduled;

  return (
    <div className="shadow-soft-md rounded-2xl bg-paper p-5">
      <div className="flex items-start gap-4">
        {/* Date chip */}
        <DateChip date={visit.scheduledDate} />

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-ink-900 truncate text-base font-semibold">{visit.title}</h3>
              {visit.vendorName && (
                <p className="text-ink-500 mt-0.5 inline-flex items-center gap-1 text-xs">
                  <MapPin size={11} strokeWidth={1.5} />
                  {visit.vendorName}
                </p>
              )}
            </div>
            <span
              className={cn(
                'inline-flex flex-shrink-0 items-center rounded-full px-2.5 py-1 text-[11px] font-medium',
                statusConfig.classes,
              )}
            >
              {statusConfig.label}
            </span>
          </div>

          {/* Scope checklist */}
          {visit.scopeItems.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {visit.scopeItems.map((item) => {
                const scopeType = getScopeType(item.scopeType);
                const Icon = scopeType?.icon;
                return (
                  <div key={item.id} className="flex items-start gap-2">
                    <span
                      className={cn(
                        'mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded',
                        item.completed
                          ? 'bg-emerald-50 text-emerald-600'
                          : 'bg-cream text-ink-400',
                      )}
                    >
                      {item.completed ? (
                        <Check size={10} strokeWidth={2.5} />
                      ) : Icon ? (
                        <Icon size={10} strokeWidth={1.5} />
                      ) : (
                        <ShieldCheck size={10} strokeWidth={1.5} />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <span
                        className={cn(
                          'text-xs',
                          item.completed ? 'text-ink-500 line-through' : 'text-ink-700',
                        )}
                      >
                        {resolveScopeLabel(item.scopeType, item.customLabel)}
                      </span>
                      {item.completionNotes && (
                        <p className="text-ink-400 mt-0.5 text-[11px] italic">
                          {item.completionNotes}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DateChip({ date }: { date: string }) {
  const { weekday, day } = parseDateParts(date);
  return (
    <div className="bg-brand-teal-50 text-brand-teal-500 flex h-12 w-12 flex-shrink-0 flex-col items-center justify-center rounded-xl text-center">
      <span className="text-[10px] font-semibold tracking-wider uppercase">{weekday}</span>
      <span className="text-base font-light">{day}</span>
    </div>
  );
}

const VISIT_STATUS_MAP: Record<string, { label: string; classes: string }> = {
  completed: { label: 'Completed', classes: 'bg-emerald-50 text-emerald-700' },
  scheduled: { label: 'Scheduled', classes: 'bg-blue-50 text-blue-700' },
  in_progress: { label: 'In progress', classes: 'bg-amber-50 text-amber-700' },
  cancelled: { label: 'Cancelled', classes: 'bg-red-50 text-red-600' },
};

// ---------------------------------------------------------------------------
// Documents section
// ---------------------------------------------------------------------------

function DocumentsSection({
  docUrls,
  plan,
}: {
  docUrls: { homeAssessmentSignedUrl: string | null; playbookSignedUrl: string | null };
  plan: MaintenancePlanRow;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <span
          aria-hidden="true"
          className="inline-block h-px w-6 flex-shrink-0"
          style={{ backgroundColor: 'var(--amber-500)' }}
        />
        <span className="text-ink-500 text-[11px] font-medium tracking-[0.18em] uppercase">
          Documents
        </span>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <DocumentCard
          title="Home Assessment"
          description="Property systems summary"
          url={docUrls.homeAssessmentSignedUrl}
          hasFile={!!plan.homeAssessmentUrl}
        />
        <DocumentCard
          title="Playbook"
          description="Operating procedures"
          url={docUrls.playbookSignedUrl}
          hasFile={!!plan.playbookUrl}
        />
      </div>
    </section>
  );
}

function DocumentCard({
  title,
  description,
  url,
  hasFile,
}: {
  title: string;
  description: string;
  url: string | null;
  hasFile: boolean;
}) {
  const inner = (
    <div
      className={cn(
        'shadow-soft-md flex items-center gap-4 rounded-2xl bg-paper p-5 transition-all',
        url && 'hover:shadow-elevated group',
      )}
    >
      <div className="bg-cream text-ink-500 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl">
        <FileText size={18} strokeWidth={1.5} />
      </div>
      <div className="min-w-0 flex-1">
        <h4 className="text-ink-900 text-sm font-semibold">{title}</h4>
        <p className="text-ink-500 mt-0.5 text-xs">
          {hasFile ? description : 'Not yet uploaded'}
        </p>
      </div>
      {url && (
        <Download
          size={16}
          strokeWidth={1.5}
          className="text-ink-400 group-hover:text-ink-700 flex-shrink-0 transition-colors"
        />
      )}
    </div>
  );

  if (url) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="block">
        {inner}
      </a>
    );
  }
  return inner;
}

// ---------------------------------------------------------------------------
// Past plans (collapsed by default — server-rendered, no client JS needed
// since we render them inline with a details/summary toggle)
// ---------------------------------------------------------------------------

function PastPlansSection({ plans }: { plans: MaintenancePlanRow[] }) {
  return (
    <details className="group">
      <summary className="text-ink-500 hover:text-ink-700 -mx-1 inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-1 py-2.5 text-sm font-medium transition-colors [&::-webkit-details-marker]:hidden">
        <ChevronDown
          size={14}
          strokeWidth={2}
          className="transition-transform group-open:rotate-180"
        />
        View past plans ({plans.length})
      </summary>
      <div className="mt-4 space-y-4">
        {plans.map((plan) => (
          <div key={plan.id} className="shadow-soft-md rounded-2xl bg-paper p-5">
            <h3 className="text-ink-900 text-base font-semibold">{plan.name}</h3>
            <p className="text-ink-500 mt-1 text-xs">
              {formatDate(plan.startDate)} – {formatDate(plan.endDate)} ·{' '}
              {plan.visits.filter((v) => v.status === 'completed').length} of {plan.visits.length} visits complete
            </p>
          </div>
        ))}
      </div>
    </details>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <div className="mx-auto w-full max-w-[1200px]">
      <header>
        <h1 className="text-ink-900 text-3xl font-light tracking-tight">Maintenance</h1>
      </header>
      <div className="shadow-soft-md mt-6 flex flex-col items-center rounded-2xl bg-paper px-8 py-12 text-center">
        <div className="bg-cream text-ink-400 mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full">
          <ShieldCheck size={22} strokeWidth={1.25} />
        </div>
        <h2 className="text-ink-900 text-base font-semibold">No maintenance plan yet</h2>
        <p className="text-ink-500 mx-auto mt-2 max-w-sm text-sm">
          No active maintenance plan for this property. Contact your Insight Point of Contact to set one up.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseDateParts(iso: string): { weekday: string; day: string } {
  const [yStr, mStr, dStr] = iso.split('-');
  const y = Number.parseInt(yStr ?? '', 10);
  const m = Number.parseInt(mStr ?? '', 10);
  const d = Number.parseInt(dStr ?? '', 10);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return { weekday: '—', day: '—' };
  }
  const localDate = new Date(y, m - 1, d);
  return {
    weekday: localDate.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
    day: d.toString(),
  };
}

function formatShortDate(iso: string): string {
  const [yStr, mStr, dStr] = iso.split('-');
  const y = Number.parseInt(yStr ?? '', 10);
  const m = Number.parseInt(mStr ?? '', 10);
  const d = Number.parseInt(dStr ?? '', 10);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return iso;
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
