'use client';

import Link from 'next/link';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { cn, formatCurrency } from '@/lib/utils';
import type { InvoiceActivityBucket, InvoiceActivityPoint } from './queries';

interface Props {
  bucket: InvoiceActivityBucket;
  points: InvoiceActivityPoint[];
}

/**
 * Composed bar+line chart for invoice activity over time.
 *
 * Bars: invoiced amount (left y-axis, formatted as $K).
 * Line: invoice count (right y-axis, plain integer).
 *
 * Three preset windows (daily / weekly / monthly) toggleable via
 * `?activity=` URL state — server fetches the right pre-bucketed
 * series and passes it down. No client-side bucketing.
 */
export function InvoiceActivityChart({ bucket, points }: Props) {
  const hasData = points.some((p) => p.amount > 0 || p.count > 0);

  return (
    <section className="shadow-soft-md flex h-full flex-col rounded-2xl bg-paper p-6">
      <div className="flex items-start justify-between gap-3">
        <Eyebrow />
        <BucketToggle current={bucket} />
      </div>

      <div className="mt-5 flex-1">
        {hasData ? (
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={points.map((p) => ({
                  ...p,
                  amountDollars: p.amount / 100,
                }))}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              >
                <CartesianGrid stroke="#E8E2D4" strokeDasharray="2 4" vertical={false} />
                <XAxis
                  dataKey="period"
                  tickFormatter={(value: string) => formatTick(value, bucket)}
                  tick={{ fontSize: 11, fill: '#6B7370' }}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                  minTickGap={20}
                />
                <YAxis
                  yAxisId="left"
                  tickFormatter={(value: number) => formatDollarsK(value)}
                  tick={{ fontSize: 11, fill: '#6B7370' }}
                  tickLine={false}
                  axisLine={false}
                  width={48}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 11, fill: '#6B7370' }}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                  width={32}
                />
                <Tooltip
                  formatter={(value, name) => {
                    const num = typeof value === 'number' ? value : Number(value) || 0;
                    if (name === 'amountDollars') {
                      return [formatCurrency(num * 100), 'Invoiced'];
                    }
                    return [num.toString(), 'Count'];
                  }}
                  labelFormatter={(label) => formatTooltipLabel(String(label ?? ''), bucket)}
                  contentStyle={{
                    backgroundColor: '#FFFFFF',
                    border: '1px solid #E8E2D4',
                    borderRadius: '12px',
                    fontSize: '12px',
                    padding: '8px 12px',
                    boxShadow: '0 8px 24px rgba(20, 30, 28, 0.08)',
                  }}
                  labelStyle={{ color: '#3C4543', fontWeight: 500 }}
                  itemStyle={{ color: '#1A1F1E' }}
                  cursor={{ fill: 'rgba(201, 154, 63, 0.08)' }}
                />
                <Bar
                  yAxisId="left"
                  dataKey="amountDollars"
                  fill="#C99A3F"
                  fillOpacity={0.7}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={36}
                  isAnimationActive={false}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="count"
                  stroke="#1A6863"
                  strokeWidth={2}
                  dot={{ r: 3, fill: '#1A6863', stroke: '#1A6863' }}
                  activeDot={{ r: 4 }}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="flex h-[280px] items-center justify-center">
            <p className="text-ink-500 text-sm">No activity in this window.</p>
          </div>
        )}
      </div>

      <Legend />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Header eyebrow + window toggle.
// ---------------------------------------------------------------------------

function Eyebrow() {
  return (
    <div>
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className="bg-brand-gold-500 inline-block h-px w-6" />
        <span className="text-ink-500 text-[11px] font-medium tracking-[0.18em] uppercase">
          Invoice activity
        </span>
      </div>
    </div>
  );
}

const BUCKETS: ReadonlyArray<{ id: InvoiceActivityBucket; label: string }> = [
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
];

function BucketToggle({ current }: { current: InvoiceActivityBucket }) {
  return (
    <div className="bg-cream inline-flex gap-1 rounded-xl p-1">
      {BUCKETS.map((b) => {
        const active = b.id === current;
        const href =
          b.id === 'monthly' ? '/admin/invoices' : `/admin/invoices?activity=${b.id}`;
        return (
          <Link
            key={b.id}
            href={href}
            className={cn(
              'rounded-lg px-3 py-1 text-xs font-medium whitespace-nowrap transition-all',
              active
                ? 'shadow-soft text-brand-teal-500 bg-paper'
                : 'text-ink-500 hover:text-ink-900',
            )}
          >
            {b.label}
          </Link>
        );
      })}
    </div>
  );
}

function Legend() {
  return (
    <div className="text-ink-500 mt-3 flex flex-wrap items-center gap-4 text-xs">
      <span className="inline-flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className="inline-block h-2.5 w-2.5 rounded-sm"
          style={{ backgroundColor: '#C99A3F', opacity: 0.7 }}
        />
        Invoiced (left axis)
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className="inline-block h-0.5 w-5 rounded-full"
          style={{ backgroundColor: '#1A6863' }}
        />
        Count (right axis)
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Formatting helpers — same parse-as-local pattern used elsewhere on
// admin so YYYY-MM-DD strings don't shift days in West Coast tz.
// ---------------------------------------------------------------------------

function formatDollarsK(dollars: number): string {
  if (dollars === 0) return '$0';
  if (Math.abs(dollars) >= 1000) {
    return `$${(dollars / 1000).toFixed(0)}K`;
  }
  return `$${dollars.toFixed(0)}`;
}

function partsOf(iso: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  return {
    y: Number.parseInt(m[1]!, 10),
    m: Number.parseInt(m[2]!, 10),
    d: Number.parseInt(m[3]!, 10),
  };
}

/** Compact axis tick: "Apr 12" for daily/weekly, "Apr" for monthly. */
function formatTick(iso: string, bucket: InvoiceActivityBucket): string {
  const p = partsOf(iso);
  if (!p) return iso;
  const dt = new Date(p.y, p.m - 1, p.d);
  if (bucket === 'monthly') {
    return dt.toLocaleDateString('en-US', { month: 'short' });
  }
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Tooltip header label: full date for daily, "Week of Apr 12" for
 *  weekly, "April 2026" for monthly. */
function formatTooltipLabel(iso: string, bucket: InvoiceActivityBucket): string {
  const p = partsOf(iso);
  if (!p) return iso;
  const dt = new Date(p.y, p.m - 1, p.d);
  if (bucket === 'monthly') {
    return dt.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }
  if (bucket === 'weekly') {
    return `Week of ${dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  }
  return dt.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}
