'use client';

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { formatCurrency } from '@/lib/utils';
import type { InvoiceCategory, InvoiceCategoryBucket } from './queries';

interface Props {
  buckets: InvoiceCategoryBucket[];
}

/** Slice colours composed from the admin token system — amber tints for
 *  Remodel (the biggest revenue slice usually), teal for Maintenance,
 *  warm-neutral for Unassigned. Resolved hex values rather than utility
 *  classes so recharts can paint them directly without Tailwind's
 *  arbitrary-value at-runtime resolution. */
const SLICE_COLOR: Record<InvoiceCategory, string> = {
  Remodel: '#C8963E', // brand-gold-400
  Maintenance: '#2D7F8C', // brand-teal-400
  Unassigned: '#D4D2CC', // brand-warm-400
};

export function InvoiceCategoryPie({ buckets }: Props) {
  if (buckets.length === 0) {
    return (
      <section className="shadow-soft-md flex h-full flex-col rounded-2xl bg-paper p-6">
        <Eyebrow />
        <p className="text-ink-500 mt-4 text-sm">No invoiced amounts to break down yet.</p>
      </section>
    );
  }

  const total = buckets.reduce((sum, b) => sum + b.totalCents, 0);

  // Recharts' built-in tooltip is sufficient for our data shape; the
  // custom render keeps the typography on-brand.
  return (
    <section className="shadow-soft-md flex h-full flex-col rounded-2xl bg-paper p-6">
      <Eyebrow />

      <div className="mt-4 grid flex-1 grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Chart */}
        <div className="relative h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={buckets}
                dataKey="totalCents"
                nameKey="category"
                cx="50%"
                cy="50%"
                innerRadius={56}
                outerRadius={94}
                paddingAngle={2}
                strokeWidth={0}
                isAnimationActive={false}
              >
                {buckets.map((b) => (
                  <Cell key={b.category} fill={SLICE_COLOR[b.category]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value, name) => [
                  formatCurrency(typeof value === 'number' ? value : Number(value) || 0),
                  String(name),
                ]}
                contentStyle={{
                  backgroundColor: '#FFFFFF',
                  border: '1px solid #E8E2D4',
                  borderRadius: '12px',
                  fontSize: '12px',
                  padding: '8px 12px',
                  boxShadow: '0 8px 24px rgba(20, 30, 28, 0.08)',
                }}
                labelStyle={{ color: '#3C4543' }}
                itemStyle={{ color: '#1A1F1E' }}
              />
            </PieChart>
          </ResponsiveContainer>
          {/* Center label — total invoiced across all categories. The
              donut hole sits at innerRadius=56, so absolute center reads
              as the headline number. */}
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <div className="text-ink-400 text-[10px] font-semibold tracking-[0.18em] uppercase">
              Invoiced
            </div>
            <div className="text-ink-900 mt-0.5 text-lg font-medium tabular-nums">
              {formatCurrency(total)}
            </div>
          </div>
        </div>

        {/* Legend with totals + percentages */}
        <ul className="flex flex-col justify-center gap-3 sm:gap-4">
          {buckets.map((b) => {
            const pct = total === 0 ? 0 : (b.totalCents / total) * 100;
            return (
              <li key={b.category} className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="mt-1 inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full"
                  style={{ backgroundColor: SLICE_COLOR[b.category] }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-ink-900 text-sm font-medium">{b.category}</span>
                    <span className="text-ink-500 text-xs font-medium tabular-nums">
                      {pct.toFixed(0)}%
                    </span>
                  </div>
                  <div className="text-ink-500 mt-0.5 text-xs tabular-nums">
                    {formatCurrency(b.totalCents)}{' '}
                    <span className="text-ink-400">
                      · {b.invoiceCount} {b.invoiceCount === 1 ? 'invoice' : 'invoices'}
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

function Eyebrow() {
  return (
    <div className="flex items-center gap-2">
      <span aria-hidden="true" className="bg-brand-gold-500 inline-block h-px w-6" />
      <span className="text-ink-500 text-[11px] font-medium tracking-[0.18em] uppercase">
        Financial breakdown
      </span>
    </div>
  );
}
