'use client';

import { AlertTriangle, CheckCircle2, Clock, MessageCircle, ThumbsUp } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { DecisionRow } from './queries';

interface DecisionsClientProps {
  rows: DecisionRow[];
}

export function DecisionsClient({ rows }: DecisionsClientProps) {
  const [clientFilter, setClientFilter] = useState<string>('');

  // Distinct clients, name-sorted, for the filter dropdown.
  const clientOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of rows) if (!seen.has(r.clientId)) seen.set(r.clientId, r.clientName);
    return Array.from(seen.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  const filtered = useMemo(
    () => (clientFilter ? rows.filter((r) => r.clientId === clientFilter) : rows),
    [rows, clientFilter],
  );

  if (rows.length === 0) return <EmptyState />;

  return (
    <div>
      {clientOptions.length > 1 && (
        <div className="mb-5 flex items-center gap-2">
          <label className="text-xs font-medium tracking-wider text-gray-500 uppercase">
            Filter by client
          </label>
          <select
            value={clientFilter}
            onChange={(e) => setClientFilter(e.target.value)}
            className="focus:ring-brand-teal-200 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:ring-2 focus:outline-none"
          >
            <option value="">All clients</option>
            {clientOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="shadow-card rounded-2xl bg-white p-12 text-center text-sm text-gray-400">
          No decisions for this client.
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((row) => (
            <DecisionCard key={row.id} row={row} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- card ----------

function DecisionCard({ row }: { row: DecisionRow }) {
  const urgency = urgencyFor(row.dueDate);
  const options = normaliseOptions(row.options);
  const typeIcon = typeIconFor(row.questionType);

  return (
    <div className="shadow-card rounded-2xl bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-gray-900">{row.title}</h3>
            {row.questionType && (
              <span className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                {typeIcon}
                {labelForType(row.questionType)}
              </span>
            )}
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
            <Link
              href={`/admin/clients/${row.clientId}`}
              className="hover:text-brand-teal-500 font-medium text-gray-700 transition-colors"
            >
              {row.clientName}
            </Link>
            <span className="text-gray-300">·</span>
            <span>{row.projectName}</span>
            <span className="text-gray-300">·</span>
            <span>{row.propertyName}</span>
          </div>
        </div>

        <UrgencyBadge urgency={urgency} dueDate={row.dueDate} />
      </div>

      {row.questionBody && (
        <p className="mt-4 text-sm whitespace-pre-wrap text-gray-700">{row.questionBody}</p>
      )}

      {options.length > 0 && (
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {options.map((opt, i) => (
            <div
              key={`${row.id}-opt-${i}`}
              className="bg-brand-warm-50 rounded-xl border border-gray-100 px-3 py-2 text-sm text-gray-700"
            >
              <span className="mr-2 text-xs font-medium text-gray-400">
                {String.fromCharCode(65 + i)}
              </span>
              {opt}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- urgency helpers ----------

type Urgency =
  | { kind: 'overdue'; days: number }
  | { kind: 'soon'; days: number }
  | { kind: 'later'; days: number | null }
  | { kind: 'undated' };

function urgencyFor(dueDate: string | null): Urgency {
  if (!dueDate) return { kind: 'undated' };
  const [y, m, d] = dueDate.split('-').map((n) => Number.parseInt(n, 10));
  const due = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffMs = due.getTime() - today.getTime();
  const days = Math.round(diffMs / (1000 * 60 * 60 * 24));
  if (days < 0) return { kind: 'overdue', days: Math.abs(days) };
  if (days <= 3) return { kind: 'soon', days };
  return { kind: 'later', days };
}

function UrgencyBadge({ urgency, dueDate }: { urgency: Urgency; dueDate: string | null }) {
  if (urgency.kind === 'overdue') {
    return (
      <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-md bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700">
        <AlertTriangle size={12} strokeWidth={1.5} />
        Overdue by {urgency.days} {urgency.days === 1 ? 'day' : 'days'}
      </span>
    );
  }
  if (urgency.kind === 'soon') {
    return (
      <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-md bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
        <Clock size={12} strokeWidth={1.5} />
        {urgency.days === 0 ? 'Due today' : `Due in ${urgency.days}d`}
      </span>
    );
  }
  if (urgency.kind === 'later' && dueDate) {
    return (
      <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-md bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
        <Clock size={12} strokeWidth={1.5} />
        {formatDueDate(dueDate)}
      </span>
    );
  }
  return (
    <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-md bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-500">
      No due date
    </span>
  );
}

function formatDueDate(iso: string): string {
  const [y, m, d] = iso.split('-').map((n) => Number.parseInt(n, 10));
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ---------- option parsing ----------

/** The `options` jsonb column can hold several shapes depending on the
 * question type. Coerce to a plain string[] for display; drop anything we
 * can't understand so a misshapen row doesn't break the page. */
function normaliseOptions(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object' && 'label' in item) {
          const label = (item as { label: unknown }).label;
          return typeof label === 'string' ? label : null;
        }
        return null;
      })
      .filter((s): s is string => Boolean(s));
  }
  return [];
}

// ---------- type label + icon ----------

function labelForType(t: NonNullable<DecisionRow['questionType']>): string {
  switch (t) {
    case 'single':
      return 'Pick one';
    case 'multi':
      return 'Pick any';
    case 'approval':
      return 'Approval';
    case 'open':
      return 'Open answer';
    case 'acknowledge':
      return 'Acknowledge';
  }
}

function typeIconFor(t: DecisionRow['questionType']) {
  switch (t) {
    case 'approval':
      return <ThumbsUp size={10} strokeWidth={1.5} />;
    case 'open':
      return <MessageCircle size={10} strokeWidth={1.5} />;
    case 'acknowledge':
      return <CheckCircle2 size={10} strokeWidth={1.5} />;
    default:
      return null;
  }
}

// ---------- empty state ----------

function EmptyState() {
  return (
    <div className="shadow-card rounded-2xl bg-white p-12 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
        <CheckCircle2 size={24} strokeWidth={1.5} />
      </div>
      <h3 className="text-base font-semibold text-gray-900">No decisions pending</h3>
      <p className="mx-auto mt-2 max-w-sm text-sm text-gray-500">
        All clients are up to date. Questions you send to clients will show up here until they
        respond.
      </p>
    </div>
  );
}
