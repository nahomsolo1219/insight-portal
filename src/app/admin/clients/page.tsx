import { ArrowDown, ArrowUp, ChevronRight, Users } from 'lucide-react';
import Link from 'next/link';
import { requireAdmin } from '@/lib/auth/current-user';
import { cn, formatCurrency, initialsFrom } from '@/lib/utils';
import { listClients, type ClientRow } from './queries';

type SortKey = 'name' | 'balance';
type SortDir = 'asc' | 'desc';
type StatusFilter = 'all' | 'active' | 'inactive';

interface PageProps {
  searchParams: Promise<{
    sort?: string;
    dir?: string;
    filter?: string;
  }>;
}

export default async function ClientsPage({ searchParams }: PageProps) {
  await requireAdmin();
  const params = await searchParams;

  const sort: SortKey = params.sort === 'balance' ? 'balance' : 'name';
  const dir: SortDir = params.dir === 'desc' ? 'desc' : 'asc';
  const filter: StatusFilter =
    params.filter === 'active' ? 'active' : params.filter === 'inactive' ? 'inactive' : 'all';

  const allClients = await listClients();

  // Filter + sort happen in-memory because listClients already returns the
  // full denormalised set in one round-trip; ~50 rows max per the query
  // module's note. Server-side filter/sort keeps the server-component
  // reload model honest and means the URL is the single source of truth.
  const filtered =
    filter === 'all'
      ? allClients
      : allClients.filter((c) => (filter === 'active' ? c.status !== 'inactive' : c.status === 'inactive'));

  const sorted = [...filtered].sort((a, b) => {
    if (sort === 'name') {
      const cmp = a.name.localeCompare(b.name);
      return dir === 'asc' ? cmp : -cmp;
    }
    // balance
    const cmp = a.balanceCents - b.balanceCents;
    return dir === 'asc' ? cmp : -cmp;
  });

  // Counts for the filter pill labels — derived from the unfiltered set so
  // the numbers don't move as the user clicks tabs.
  const counts = {
    all: allClients.length,
    active: allClients.filter((c) => c.status !== 'inactive').length,
    inactive: allClients.filter((c) => c.status === 'inactive').length,
  };

  return (
    <div>
      {/* Page header */}
      <div className="mb-8">
        <div className="mb-3 flex items-center gap-2">
          <span aria-hidden="true" className="bg-brand-gold-500 inline-block h-px w-8" />
          <span className="text-ink-500 text-[11px] font-medium uppercase tracking-[0.18em]">
            Book of business
          </span>
        </div>
        <h1 className="text-ink-900 text-3xl font-light tracking-tight">Clients</h1>
        <p className="mt-1 text-sm text-gray-500">
          {allClients.length} {allClients.length === 1 ? 'client' : 'clients'}
        </p>
      </div>

      {allClients.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <FilterTabs current={filter} sort={sort} dir={dir} counts={counts} />
          <ClientTable rows={sorted} sort={sort} dir={dir} filter={filter} />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Filter tabs — All / Active / Inactive. Clicking re-encodes the URL.
// ---------------------------------------------------------------------------

function FilterTabs({
  current,
  sort,
  dir,
  counts,
}: {
  current: StatusFilter;
  sort: SortKey;
  dir: SortDir;
  counts: { all: number; active: number; inactive: number };
}) {
  const tabs: ReadonlyArray<{ id: StatusFilter; label: string; count: number }> = [
    { id: 'all', label: 'All', count: counts.all },
    { id: 'active', label: 'Active', count: counts.active },
    { id: 'inactive', label: 'Inactive', count: counts.inactive },
  ];

  return (
    <nav
      aria-label="Filter clients"
      className="border-line mb-5 flex gap-1 border-b"
    >
      {tabs.map((t) => {
        const active = t.id === current;
        const href = buildClientsHref({ filter: t.id, sort, dir });
        return (
          <Link
            key={t.id}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'relative px-4 py-2.5 text-sm font-medium transition-colors',
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
  );
}

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

function ClientTable({
  rows,
  sort,
  dir,
  filter,
}: {
  rows: ClientRow[];
  sort: SortKey;
  dir: SortDir;
  filter: StatusFilter;
}) {
  if (rows.length === 0) {
    return (
      <div className="shadow-soft-md rounded-2xl bg-paper p-12 text-center">
        <p className="text-sm text-ink-500">
          No clients match this filter.{' '}
          <Link
            href={buildClientsHref({ filter: 'all', sort, dir })}
            className="text-brand-teal-500 hover:underline"
          >
            Show all
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="shadow-soft-md overflow-hidden rounded-2xl bg-paper">
      {/* Horizontal scroll on narrow viewports — cards-on-mobile would
          need a parallel render path; the scrolling table keeps the same
          information dense and shareable URL. */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px]">
          <thead>
            <tr className="bg-cream border-line border-b">
              <SortableTh
                label="Client"
                sortKey="name"
                currentSort={sort}
                currentDir={dir}
                filter={filter}
              />
              <Th>Tier</Th>
              <Th align="right">Projects</Th>
              <SortableTh
                label="Balance"
                sortKey="balance"
                currentSort={sort}
                currentDir={dir}
                filter={filter}
                align="right"
              />
              <Th>Assigned PM</Th>
              <Th>
                <span className="sr-only">Open</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((client, i) => (
              <ClientRow
                key={client.id}
                client={client}
                isLast={i === rows.length - 1}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ClientRow({ client, isLast }: { client: ClientRow; isLast: boolean }) {
  const balanceClass = client.balanceCents > 0 ? 'text-amber-600' : 'text-ink-700';

  return (
    <tr
      className={cn(
        'hover:bg-cream group transition-colors',
        !isLast && 'border-line-2 border-b',
      )}
    >
      <Td>
        <Link
          href={`/admin/clients/${client.id}`}
          className="flex items-center gap-3"
        >
          {client.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={client.avatarUrl}
              alt={client.name}
              className="h-9 w-9 flex-shrink-0 rounded-full object-cover"
            />
          ) : (
            <span className="bg-brand-teal-500 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white">
              {initialsFrom(client.name) || 'C'}
            </span>
          )}
          <div className="min-w-0">
            <div className="text-ink-900 truncate text-sm font-medium">
              {client.name}
            </div>
            {client.primaryAddress && (
              <div className="text-ink-500 truncate text-xs">
                {client.primaryAddress}
                {client.propertyCount > 1 && (
                  <span className="text-ink-400"> +{client.propertyCount - 1}</span>
                )}
              </div>
            )}
          </div>
        </Link>
      </Td>
      <Td>
        {client.status === 'inactive' ? (
          <span className="bg-ivory text-ink-500 inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium">
            Inactive
          </span>
        ) : client.tierName ? (
          <span className="bg-brand-teal-50 text-brand-teal-500 inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium">
            {client.tierName}
          </span>
        ) : (
          <span className="text-ink-400 text-xs">—</span>
        )}
      </Td>
      <Td align="right">
        <span className="text-ink-700 text-sm font-medium tabular-nums">
          {client.activeProjectCount}
        </span>
      </Td>
      <Td align="right">
        <span className={cn('text-sm font-medium tabular-nums', balanceClass)}>
          {formatCurrency(client.balanceCents)}
        </span>
      </Td>
      <Td>
        <span className="text-ink-700 text-sm">
          {client.assignedPmName ?? <span className="text-ink-400">Unassigned</span>}
        </span>
      </Td>
      <Td align="right">
        <Link
          href={`/admin/clients/${client.id}`}
          aria-label={`Open ${client.name}`}
          className="text-ink-300 group-hover:text-ink-500 inline-flex items-center"
        >
          <ChevronRight size={16} strokeWidth={1.5} />
        </Link>
      </Td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Header cell helpers
// ---------------------------------------------------------------------------

function Th({
  children,
  align = 'left',
}: {
  children: React.ReactNode;
  align?: 'left' | 'right';
}) {
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
  align = 'left',
}: {
  label: string;
  sortKey: SortKey;
  currentSort: SortKey;
  currentDir: SortDir;
  filter: StatusFilter;
  align?: 'left' | 'right';
}) {
  const isActive = currentSort === sortKey;
  // Toggle direction on second click; first click on a column lands on asc
  // for name, desc for balance (more useful default).
  const nextDir: SortDir = isActive
    ? currentDir === 'asc'
      ? 'desc'
      : 'asc'
    : sortKey === 'balance'
      ? 'desc'
      : 'asc';
  const href = buildClientsHref({ filter, sort: sortKey, dir: nextDir });

  return (
    <th
      scope="col"
      className={cn(
        'text-ink-500 px-4 py-3 text-xs font-semibold uppercase tracking-wider',
        align === 'right' ? 'text-right' : 'text-left',
      )}
    >
      <Link
        href={href}
        className={cn(
          'hover:text-ink-900 inline-flex items-center gap-1 transition-colors',
          align === 'right' && 'flex-row-reverse',
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

function Td({
  children,
  align = 'left',
}: {
  children: React.ReactNode;
  align?: 'left' | 'right';
}) {
  return (
    <td
      className={cn(
        'px-4 py-3 align-middle',
        align === 'right' ? 'text-right' : 'text-left',
      )}
    >
      {children}
    </td>
  );
}

// ---------------------------------------------------------------------------
// URL builder + empty state
// ---------------------------------------------------------------------------

function buildClientsHref({
  filter,
  sort,
  dir,
}: {
  filter: StatusFilter;
  sort: SortKey;
  dir: SortDir;
}): string {
  const params = new URLSearchParams();
  if (filter !== 'all') params.set('filter', filter);
  if (sort !== 'name') params.set('sort', sort);
  // Encode dir only when it diverges from the per-column default. Keeps
  // the URL shorter for the common case (name asc).
  const defaultDir: SortDir = sort === 'balance' ? 'desc' : 'asc';
  if (dir !== defaultDir) params.set('dir', dir);
  const qs = params.toString();
  return qs ? `/admin/clients?${qs}` : '/admin/clients';
}

function EmptyState() {
  return (
    <div className="shadow-soft-md rounded-2xl bg-paper p-12 text-center">
      <div className="bg-cream mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full text-ink-400">
        <Users size={24} strokeWidth={1.5} />
      </div>
      <h2 className="text-ink-900 text-lg font-semibold">No clients yet</h2>
      <p className="text-ink-500 mx-auto mt-2 max-w-sm text-sm">
        Add your first client to get started. You&apos;ll be able to add their properties, projects,
        and appointments after.
      </p>
    </div>
  );
}
