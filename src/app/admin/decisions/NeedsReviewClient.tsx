'use client';

import { Check, CheckCircle2, ClipboardList } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { LoadingDots } from '@/components/admin/LoadingDots';
import { useToast } from '@/components/admin/ToastProvider';
import { cn } from '@/lib/utils';
import { markDecisionComplete } from './actions';
import type { DecisionRow } from './queries';

interface NeedsReviewClientProps {
  rows: DecisionRow[];
}

export function NeedsReviewClient({ rows }: NeedsReviewClientProps) {
  if (rows.length === 0) return <EmptyState />;

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <NeedsReviewRow key={row.id} row={row} />
      ))}
      {rows.length === 50 && (
        <p className="px-1 text-xs text-gray-500">
          Showing the 50 most recently answered decisions.
        </p>
      )}
    </div>
  );
}

// ---------- row ----------

function NeedsReviewRow({ row }: { row: DecisionRow }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [closed, setClosed] = useState(false);

  const chosen = row.clientResponse
    ? row.options.find((o) => o.label === row.clientResponse) ?? null
    : null;

  function handleMarkComplete() {
    startTransition(async () => {
      const result = await markDecisionComplete(row.id);
      if (!result.success) {
        showToast(result.error, 'error');
        return;
      }
      setClosed(true);
      showToast('Decision marked complete');
      router.refresh();
    });
  }

  return (
    <div
      className={cn(
        'shadow-soft-md flex gap-4 rounded-2xl border-l-2 bg-paper p-5 transition-opacity',
        closed ? 'border-emerald-300 opacity-60' : 'border-brand-gold-400',
      )}
    >
      {chosen?.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={chosen.imageUrl}
          alt={chosen.label}
          loading="lazy"
          className="h-16 w-16 flex-shrink-0 rounded-lg object-cover"
        />
      ) : (
        <div className="bg-brand-gold-50 text-brand-gold-500 flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-lg">
          <ClipboardList size={22} strokeWidth={1.5} />
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

        <div className="mt-4 flex items-center justify-end gap-2">
          <Link
            href={`/admin/projects/${row.projectId}`}
            className="text-brand-teal-500 border-brand-teal-200 hover:border-brand-teal-300 hover:bg-brand-teal-50 inline-flex items-center gap-1.5 rounded-xl border px-4 py-2 text-xs font-medium transition-all"
          >
            View project
          </Link>
          <button
            type="button"
            onClick={handleMarkComplete}
            disabled={isPending || closed}
            className="bg-brand-gold-400 hover:bg-brand-gold-500 shadow-soft inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-medium text-white transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? (
              <>
                Marking
                <LoadingDots />
              </>
            ) : closed ? (
              <>
                <Check size={12} strokeWidth={2} />
                Marked complete
              </>
            ) : (
              <>
                <Check size={12} strokeWidth={2} />
                Mark complete
              </>
            )}
          </button>
        </div>
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
      className="bg-brand-gold-50 text-brand-gold-700 inline-flex flex-shrink-0 items-center rounded-md px-2.5 py-1 text-xs font-medium"
    >
      Responded {rel}
    </span>
  );
}

function relativeTime(d: Date): string {
  const diffMs = Date.now() - d.getTime();
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return 'just now';
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

// ---------- empty state ----------

function EmptyState() {
  return (
    <div className="shadow-soft-md rounded-2xl bg-paper p-12 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
        <CheckCircle2 size={24} strokeWidth={1.5} />
      </div>
      <h3 className="text-base font-semibold text-gray-900">
        No decisions waiting on you
      </h3>
      <p className="mx-auto mt-2 max-w-sm text-sm text-gray-500">
        When a client answers a decision, it&apos;ll show up here so you can review
        and close it out.
      </p>
    </div>
  );
}
