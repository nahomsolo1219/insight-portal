import { ArrowDown, ArrowUp, ChevronRight, Wrench } from 'lucide-react';
import Link from 'next/link';
import { requireAdmin } from '@/lib/auth/current-user';
import { cn, formatCurrency, formatDate } from '@/lib/utils';
import { NewPlanButton } from './NewPlanButton';
import {
  getActiveFieldStaff,
  getActivePropertiesForPicker,
  getActiveVendorsForPicker,
  getPlanYearOptions,
  listPlans,
  type PlanListRow,
  type PlanStatus,
} from './queries';

type SortKey = 'start_date' | 'status';
type SortDir = 'asc' | 'desc';
type StatusFilter = 'all' | PlanStatus;

interface PageProps {
  searchParams: Promise<{
    sort?: string;
    dir?: string;
    filter?: string;
    year?: string;
    q?: string;
  }>;
}

export default async function MaintenancePage({ searchParams }: PageProps) {
  await requireAdmin();
  const params = await searchParams;

  const sort: SortKey = params.sort === 'status' ? 'status' : 'start_date';
  const dir: SortDir = params.dir === 'asc' ? 'asc' : 'desc';
  const filter: StatusFilter = isStatusFilter(params.filter) ? params.filter : 'all';
  const yearFilter = params.year && /^\d{4}$/.test(params.year) ? params.year : null;
  const q = (params.q ?? '').trim().toLowerCase();

  const [plans, properties, vendorOptions, fieldStaffOptions, yearOptions] =
    await Promise.all([
      listPlans(),
      getActivePropertiesForPicker(),
      getActiveVendorsForPicker(),
      getActiveFieldStaff(),
      getPlanYearOptions(),
    ]);

  // Apply filters in memory — same pattern as the clients list. The
  // result set is small (one row per plan, ~hundreds at most) so a
  // server roundtrip per filter change isn't worth the complexity of
  // pushing the filters into SQL.
  const filtered = plans.filter((p) => {
    if (filter !== 'all' && p.status !== filter) return false;
    if (yearFilter && !p.startDate.startsWith(yearFilter)) return false;
    if (q) {
      const haystack = `${p.name} ${p.propertyName} ${p.clientName}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sort === 'status') {
      const cmp = a.status.localeCompare(b.status);
      return dir === 'asc' ? cmp : -cmp;
    }
    const cmp = a.startDate.localeCompare(b.startDate);
    return dir === 'asc' ? cmp : -cmp;
  });

  const counts = {
    all: plans.length,
    active: plans.filter((p) => p.status === 'active').length,
    draft: plans.filter((p) => p.status === 'draft').length,
    archived: plans.filter((p) => p.status === 'archived').length,
    completed: plans.filter((p) => p.status === 'completed').length,
  };

  return (
    <div>
      {/* Page header */}
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <div className="mb-3 flex items-center gap-2">
            <span aria-hidden="true" className="bg-brand-gold-500 inline-block h-px w-8" />
            <span className="text-ink-500 text-[11px] font-medium uppercase tracking-[0.18em]">
              Recurring service
            </span>
          </div>
          <h1 className="text-ink-900 text-3xl font-light tracking-tight">Maintenance</h1>
          <p className="mt-1 text-sm text-gray-500">
            {plans.length} {plans.length === 1 ? 'plan' : 'plans'} across{' '}
            {new Set(plans.map((p) => p.clientId)).size} clients
          </p>
        </div>
        <NewPlanButton
          properties={properties}
          vendors={vendorOptions}
          fieldStaff={fieldStaffOptions}
        />
      </div>

      {plans.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <FilterRow
            current={filter}
            sort={sort}
            dir={dir}
            year={yearFilter}
            q={q}
            counts={counts}
            yearOptions={yearOptions}
          />
          <PlanTable rows={sorted} sort={sort} dir={dir} filter={filter} year={yearFilter} q={q} />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function isStatusFilter(value: unknown): value is StatusFilter {
  return (
    value === 'all' ||
    value === 'active' ||
    value === 'draft' ||
    value === 'archived' ||
    value === 'completed'
  );
}

function FilterRow({
  current,
  sort,
  dir,
  year,
  q,
  counts,
  yearOptions,
}: {
  current: StatusFilter;
  sort: SortKey;
  dir: SortDir;
  year: string | null;
  q: string;
  counts: Record<'all' | 'active' | 'draft' | 'archived' | 'completed', number>;
  yearOptions: number[];
}) {
  const tabs: ReadonlyArray<{ id: StatusFilter; label: string; count: number }> = [
    { id: 'all', label: 'All', count: counts.all },
    { id: 'active', label: 'Active', count: counts.active },
    { id: 'draft', label: 'Draft', count: counts.draft },
    { id: 'completed', label: 'Completed', count: counts.completed },
    { id: 'archived', label: 'Archived', count: counts.archived },
  ];

  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <nav
        aria-label="Filter plans"
        className="border-line -mx-1 flex max-w-full gap-1 overflow-x-auto border-b px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {tabs.map((t) => {
          const active = t.id === current;
          const href = buildHref({ filter: t.id, sort, dir, year, q });
          return (
            <Link
              key={t.id}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'relative flex-shrink-0 whitespace-nowrap px-4 py-2.5 text-sm font-medium transition-colors',
                active ? 'text-ink-900' : 'text-ink-500 hover:text-ink-700',
              )}
            >
              <span className="inline-flex items-center gap-2">
                {t.label}
                {t.count > 0 && (
                  <span
                    className={cn(
                      'rounded-full px-1.5 text-[11px] font-semibold',
                      active
                        ? 'bg-brand-gold-100 text-brand-gold-700'
                        : 'bg-cream text-ink-500',
                    )}
                  >
                    {t.count}
                  </span>
                )}
              </span>
              {active && (
                <span
                  aria-hidden="true"
                  className="bg-brand-gold-500 absolute right-4 -bottom-px left-4 h-0.5 rounded-full"
                />
              )}
            </Link>
          );
        })}
      </nav>

      <form
        action="/admin/maintenance"
        method="get"
        className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap"
      >
        <input
          type="search"
          name="q"
          placeholder="Search clients or plans"
          defaultValue={q}
          className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-paper px-4 py-2 text-sm placeholder:text-gray-400 focus:border-brand-teal-400 focus:outline-none focus:ring-2 focus:ring-brand-teal-200 sm:w-56 sm:flex-none"
        />
        {/* Hidden inputs preserve the rest of the URL state when the
            search submits. */}
        {current !== 'all' && <input type="hidden" name="filter" value={current} />}
        {sort !== 'start_date' && <input type="hidden" name="sort" value={sort} />}
        {dir !== 'desc' && <input type="hidden" name="dir" value={dir} />}
        <select
          name="year"
          defaultValue={year ?? ''}
          className="rounded-xl border border-gray-200 bg-paper px-3 py-2 text-sm focus:border-brand-teal-400 focus:outline-none focus:ring-2 focus:ring-brand-teal-200"
        >
          <option value="">Any year</option>
          {yearOptions.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-xl border border-brand-teal-200 bg-brand-teal-50 px-3 py-2 text-sm font-medium text-brand-teal-500 transition-colors hover:border-brand-teal-300"
        >
          Apply
        </button>
      </form>
    </div>
  );
}

function PlanTable({
  rows,
  sort,
  dir,
  filter,
  year,
  q,
}: {
  rows: PlanListRow[];
  sort: SortKey;
  dir: SortDir;
  filter: StatusFilter;
  year: string | null;
  q: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="shadow-soft-md rounded-2xl bg-paper p-12 text-center">
        <p className="text-sm text-ink-500">
          No plans match the current filters.{' '}
          <Link
            href="/admin/maintenance"
            className="text-brand-teal-500 hover:underline"
          >
            Clear filters
          </Link>
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Mobile: card-per-row (the table's min-w-[920px] would force the phone
          viewport ~905px wide otherwise). */}
      <div className="space-y-3 md:hidden">
        {rows.map((p) => (
          <PlanCard key={p.id} plan={p} />
        ))}
      </div>

      {/* Desktop: dense sortable table, unchanged. */}
      <div className="shadow-soft-md hidden overflow-hidden rounded-2xl bg-paper md:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px]">
          <thead>
            <tr className="bg-cream border-line border-b">
              <Th>Plan</Th>
              <Th>Property</Th>
              <Th>Client</Th>
              <SortableTh
                label="Start"
                sortKey="start_date"
                currentSort={sort}
                currentDir={dir}
                filter={filter}
                year={year}
                q={q}
              />
              <Th>End</Th>
              <Th align="right">Visits</Th>
              <Th align="right">Billing</Th>
              <SortableTh
                label="Status"
                sortKey="status"
                currentSort={sort}
                currentDir={dir}
                filter={filter}
                year={year}
                q={q}
              />
              <Th>
                <span className="sr-only">Open</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p, i) => (
              <PlanRow key={p.id} plan={p} isLast={i === rows.length - 1} />
            ))}
          </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// Mobile card — one plan per card (below md).
function PlanCard({ plan }: { plan: PlanListRow }) {
  return (
    <Link
      href={`/admin/maintenance/${plan.id}`}
      className="shadow-soft-md hover:bg-cream block rounded-2xl bg-paper p-4 transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-ink-900 truncate text-sm font-medium">{plan.name}</div>
          <div className="text-ink-500 mt-0.5 truncate text-xs">
            {plan.propertyName} · {plan.clientName}
          </div>
        </div>
        <PlanStatusBadge status={plan.status} />
      </div>
      <dl className="border-line-2 mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t pt-3 text-xs">
        <div className="min-w-0">
          <dt className="text-ink-400 text-[10px] font-semibold tracking-wider uppercase">Dates</dt>
          <dd className="text-ink-700 mt-0.5 tabular-nums">
            {formatDate(plan.startDate)} – {formatDate(plan.endDate)}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-ink-400 text-[10px] font-semibold tracking-wider uppercase">Visits</dt>
          <dd className="text-ink-700 mt-0.5 tabular-nums">
            {plan.completedVisitCount} / {plan.visitCount}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-ink-400 text-[10px] font-semibold tracking-wider uppercase">Billing</dt>
          <dd className="text-ink-700 mt-0.5 tabular-nums">
            {plan.billingTotalCents != null ? formatCurrency(plan.billingTotalCents) : '—'}
          </dd>
        </div>
      </dl>
    </Link>
  );
}

function PlanRow({ plan, isLast }: { plan: PlanListRow; isLast: boolean }) {
  return (
    <tr
      className={cn(
        'hover:bg-cream group transition-colors',
        !isLast && 'border-line-2 border-b',
      )}
    >
      <Td>
        <Link
          href={`/admin/maintenance/${plan.id}`}
          className="text-ink-900 text-sm font-medium hover:text-brand-teal-500"
        >
          {plan.name}
        </Link>
      </Td>
      <Td>
        <Link
          href={`/admin/clients/${plan.clientId}`}
          className="text-ink-700 text-sm hover:text-brand-teal-500"
        >
          {plan.propertyName}
        </Link>
      </Td>
      <Td>
        <Link
          href={`/admin/clients/${plan.clientId}`}
          className="text-ink-700 text-sm hover:text-brand-teal-500"
        >
          {plan.clientName}
        </Link>
      </Td>
      <Td>
        <span className="text-ink-700 text-sm tabular-nums">{formatDate(plan.startDate)}</span>
      </Td>
      <Td>
        <span className="text-ink-700 text-sm tabular-nums">{formatDate(plan.endDate)}</span>
      </Td>
      <Td align="right">
        <span className="text-ink-700 text-sm tabular-nums">
          {plan.completedVisitCount} / {plan.visitCount}
        </span>
      </Td>
      <Td align="right">
        <span className="text-ink-700 text-sm tabular-nums">
          {plan.billingTotalCents != null ? formatCurrency(plan.billingTotalCents) : '—'}
        </span>
      </Td>
      <Td>
        <PlanStatusBadge status={plan.status} />
      </Td>
      <Td align="right">
        <Link
          href={`/admin/maintenance/${plan.id}`}
          aria-label={`Open ${plan.name}`}
          className="text-ink-300 group-hover:text-ink-500 inline-flex items-center"
        >
          <ChevronRight size={16} strokeWidth={1.5} />
        </Link>
      </Td>
    </tr>
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
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium tracking-wide', tone.classes)}>
      {tone.label}
    </span>
  );
}

// ---------------------------------------------------------------------------

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th
      scope="col"
      className={cn(
        'text-ink-500 px-4 py-3 text-xs font-semibold uppercase tracking-wider',
        align === 'right' ? 'text-right' : 'text-left',
      )}
    >
      {children}
    </th>
  );
}

function SortableTh({
  label,
  sortKey,
  currentSort,
  currentDir,
  filter,
  year,
  q,
}: {
  label: string;
  sortKey: SortKey;
  currentSort: SortKey;
  currentDir: SortDir;
  filter: StatusFilter;
  year: string | null;
  q: string;
}) {
  const isActive = currentSort === sortKey;
  const nextDir: SortDir = isActive ? (currentDir === 'asc' ? 'desc' : 'asc') : 'desc';
  const href = buildHref({ filter, sort: sortKey, dir: nextDir, year, q });

  return (
    <th scope="col" className="text-ink-500 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider">
      <Link
        href={href}
        className={cn(
          'hover:text-ink-900 inline-flex items-center gap-1 transition-colors',
          isActive && 'text-ink-900',
        )}
      >
        {label}
        {isActive ? (
          currentDir === 'asc' ? (
            <ArrowUp size={11} strokeWidth={2} />
          ) : (
            <ArrowDown size={11} strokeWidth={2} />
          )
        ) : (
          <span aria-hidden="true" className="text-ink-300 text-[10px]">
            ⇅
          </span>
        )}
      </Link>
    </th>
  );
}

function Td({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <td className={cn('px-4 py-3 align-middle', align === 'right' ? 'text-right' : 'text-left')}>
      {children}
    </td>
  );
}

function buildHref({
  filter,
  sort,
  dir,
  year,
  q,
}: {
  filter: StatusFilter;
  sort: SortKey;
  dir: SortDir;
  year: string | null;
  q: string;
}): string {
  const params = new URLSearchParams();
  if (filter !== 'all') params.set('filter', filter);
  if (sort !== 'start_date') params.set('sort', sort);
  if (dir !== 'desc') params.set('dir', dir);
  if (year) params.set('year', year);
  if (q) params.set('q', q);
  const qs = params.toString();
  return qs ? `/admin/maintenance?${qs}` : '/admin/maintenance';
}

function EmptyState() {
  return (
    <div className="shadow-soft-md rounded-2xl bg-paper p-12 text-center">
      <div className="bg-cream mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full text-ink-400">
        <Wrench size={24} strokeWidth={1.5} />
      </div>
      <h2 className="text-ink-900 text-lg font-semibold">No maintenance plans yet</h2>
      <p className="text-ink-500 mx-auto mt-2 max-w-sm text-sm">
        Build a plan from scratch — pick a property, set the cadence, configure scope per visit.
        Old project-style plans will live on as history.
      </p>
    </div>
  );
}
