'use client';

import { Check, CheckCircle2, ClipboardCheck } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { cn } from '@/lib/utils';
import type {
  DecisionRow,
  PastDecisionClientOption,
  PastDecisionSort,
} from './queries';

interface Filters {
  clientId: string;
  startDate: string;
  endDate: string;
  sort: PastDecisionSort;
}

interface PastDecisionsClientProps {
  rows: DecisionRow[];
  clientOptions: PastDecisionClientOption[];
  filters: Filters;
}

export function PastDecisionsClient({
  rows,
  clientOptions,
  filters,
}: PastDecisionsClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const hasFilters =
    Boolean(filters.clientId) ||
    Boolean(filters.startDate) ||
    Boolean(filters.endDate);

  function pushFilters(next: Partial<Filters>) {
    const merged: Filters = { ...filters, ...next };
    const params = new URLSearchParams({ view: 'past' });
    if (merged.clientId) params.set('clientId', merged.clientId);
    if (merged.startDate) params.set('startDate', merged.startDate);
    if (merged.endDate) params.set('endDate', merged.endDate);
    if (merged.sort && merged.sort !== 'newest') params.set('sort', merged.sort);
    startTransition(() => {
      router.push(`/admin/decisions?${params.toString()}`);
    });
  }

  return (
    <div className={cn('space-y-5', isPending && 'opacity-70 transition-opacity')}>
      <div className="shadow-soft-md flex flex-wrap items-end gap-4 rounded-2xl bg-paper p-4">
        <FilterField label="Client">
          <select
            value={filters.clientId}
            onChange={(e) => pushFilters({ clientId: e.target.value })}
            className="focus:ring-brand-teal-200 focus:border-brand-teal-400 w-full rounded-xl border border-line bg-paper px-3 py-2 text-sm text-gray-700 focus:ring-2 focus:outline-none"
          >
            <option value="">All clients</option>
            {clientOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </FilterField>

        <FilterField label="From">
          <input
            type="date"
            value={filters.startDate}
            max={filters.endDate || undefined}
            onChange={(e) => pushFilters({ startDate: e.target.value })}
            className="focus:ring-brand-teal-200 focus:border-brand-teal-400 w-full rounded-xl border border-line bg-paper px-3 py-2 text-sm text-gray-700 focus:ring-2 focus:outline-none"
          />
        </FilterField>

        <FilterField label="To">
          <input
            type="date"
            value={filters.endDate}
            min={filters.startDate || undefined}
            onChange={(e) => pushFilters({ endDate: e.target.value })}
            className="focus:ring-brand-teal-200 focus:border-brand-teal-400 w-full rounded-xl border border-line bg-paper px-3 py-2 text-sm text-gray-700 focus:ring-2 focus:outline-none"
          />
        </FilterField>

        <FilterField label="Sort">
          <select
            value={filters.sort}
            onChange={(e) =>
              pushFilters({ sort: e.target.value as PastDecisionSort })
            }
            className="focus:ring-brand-teal-200 focus:border-brand-teal-400 w-full rounded-xl border border-line bg-paper px-3 py-2 text-sm text-gray-700 focus:ring-2 focus:outline-none"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="client">By client</option>
          </select>
        </FilterField>

        {hasFilters && (
          <button
            type="button"
            onClick={() =>
              pushFilters({ clientId: '', startDate: '', endDate: '' })
            }
            className="hover:text-brand-teal-500 ml-auto text-xs font-medium text-gray-500 underline-offset-2 transition-colors hover:underline"
          >
            Reset filters
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyState hasFilters={hasFilters} />
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <PastDecisionRow key={row.id} row={row} />
          ))}
          {rows.length === 50 && (
            <p className="px-1 text-xs text-gray-500">
              Showing the 50 most recent matches. Narrow the date range to see older
              decisions.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- row ----------

function PastDecisionRow({ row }: { row: DecisionRow }) {
  const chosen = row.clientResponse
    ? row.options.find((o) => o.label === row.clientResponse) ?? null
    : null;

  return (
    <div className="shadow-soft-md flex gap-4 rounded-2xl border-l-2 border-emerald-300 bg-paper p-5">
      {chosen?.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={chosen.imageUrl}
          alt={chosen.label}
          loading="lazy"
          className="h-16 w-16 flex-shrink-0 rounded-lg object-cover"
        />
      ) : (
        <div className="bg-brand-warm-100 flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-lg text-emerald-500">
          <ClipboardCheck size={22} strokeWidth={1.5} />
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-gray-900">{row.title}</h3>
            <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-gray-500">
              <span className="text-gray-700 font-medium">{row.clientName}</span>
              <span className="text-gray-300">·</span>
              <span>{row.propertyName}</span>
              <span className="text-gray-300">·</span>
              <Link
                href={`/admin/projects/${row.projectId}`}
                className="hover:text-brand-teal-500 transition-colors"
              >
                {row.projectName}
              </Link>
            </div>
          </div>
          <RespondedBadge respondedAt={row.respondedAt} />
        </div>

        {row.clientResponse && (
          <div className="mt-3 flex items-start gap-2 text-sm">
            <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold tracking-wider text-emerald-700 uppercase">
              <Check size={9} strokeWidth={2.5} />
              Chose
            </span>
            <span className="min-w-0 break-words whitespace-pre-wrap text-gray-900">
              {row.clientResponse}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- responded badge ----------

function RespondedBadge({ respondedAt }: { respondedAt: Date | null }) {
  if (!respondedAt) {
    return (
      <span className="inline-flex flex-shrink-0 items-center rounded-md bg-gray-50 px-2 py-1 text-xs font-medium text-gray-500">
        Responded
      </span>
    );
  }
  const rel = relativeTime(respondedAt);
  const full = respondedAt.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  return (
    <span
      title={full}
      className="inline-flex flex-shrink-0 items-center rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700"
    >
      {rel}
    </span>
  );
}

function relativeTime(d: Date): string {
  const diffMs = Date.now() - d.getTime();
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return 'Just now';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d ago`;
  if (day < 30) {
    const wk = Math.round(day / 7);
    return `${wk}w ago`;
  }
  if (day < 365) {
    const mo = Math.round(day / 30);
    return `${mo}mo ago`;
  }
  const yr = Math.round(day / 365);
  return `${yr}y ago`;
}

// ---------- filter field wrapper ----------

function FilterField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-[140px] flex-1 sm:flex-none">
      <label className="mb-1.5 block text-[10px] font-semibold tracking-wider text-gray-500 uppercase">
        {label}
      </label>
      {children}
    </div>
  );
}

// ---------- empty state ----------

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  if (hasFilters) {
    return (
      <div className="shadow-soft-md rounded-2xl bg-paper p-12 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-400">
          <CheckCircle2 size={24} strokeWidth={1.5} />
        </div>
        <h3 className="text-base font-semibold text-gray-900">
          No past decisions match these filters
        </h3>
        <p className="mx-auto mt-2 max-w-sm text-sm text-gray-500">
          Try widening the date range or clearing the client filter.
        </p>
      </div>
    );
  }
  return (
    <div className="shadow-soft-md rounded-2xl bg-paper p-12 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
        <CheckCircle2 size={24} strokeWidth={1.5} />
      </div>
      <h3 className="text-base font-semibold text-gray-900">No past decisions yet</h3>
      <p className="mx-auto mt-2 max-w-sm text-sm text-gray-500">
        Once clients respond to decisions, they&apos;ll appear here.
      </p>
    </div>
  );
}
