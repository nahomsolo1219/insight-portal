// Cross-client invoice queries. Mirrors the per-client Invoices tab
// queries but with no client filter — every invoice in the system,
// joined to its client/property/project for display.

import { count, desc, eq, gte, sql, sum } from 'drizzle-orm';
import { db } from '@/db';
import { clients, invoices, projects, properties } from '@/db/schema';

/** Bucket key for the financial-breakdown chart. The schema has no
 *  `invoices.category` column, so we infer from the linked project's
 *  `type` and fall back to `Unassigned` for invoices without a project
 *  link. Adding a real category column later is a future migration. */
export type InvoiceCategory = 'Remodel' | 'Maintenance' | 'Unassigned';

export interface InvoiceCategoryBucket {
  category: InvoiceCategory;
  totalCents: number;
  invoiceCount: number;
}

export interface InvoiceOverviewRow {
  id: string;
  invoiceNumber: string;
  description: string | null;
  amountCents: number;
  invoiceDate: string;
  dueDate: string;
  status: 'paid' | 'unpaid' | 'partial';
  storagePath: string;
  clientId: string;
  clientName: string;
  projectName: string | null;
  propertyName: string | null;
}

export async function getAllInvoices(): Promise<InvoiceOverviewRow[]> {
  return db
    .select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      description: invoices.description,
      amountCents: invoices.amountCents,
      invoiceDate: invoices.invoiceDate,
      dueDate: invoices.dueDate,
      status: invoices.status,
      storagePath: invoices.storagePath,
      clientId: clients.id,
      clientName: clients.name,
      projectName: projects.name,
      propertyName: properties.name,
    })
    .from(invoices)
    .innerJoin(clients, eq(clients.id, invoices.clientId))
    .leftJoin(projects, eq(projects.id, invoices.projectId))
    .leftJoin(properties, eq(properties.id, invoices.propertyId))
    .orderBy(desc(invoices.invoiceDate), desc(invoices.createdAt));
}

export interface InvoiceSummaryAll {
  totalInvoiced: number;
  totalPaid: number;
  totalOutstanding: number;
  invoiceCount: number;
}

/**
 * Total invoiced + invoice count per category (Remodel / Maintenance /
 * Unassigned). Drives the financial-breakdown pie chart on the
 * /admin/invoices page. Returns ordered buckets with zero-amount
 * categories filtered out so the pie never renders an empty slice.
 *
 * Schema note: there's no `invoices.category` column. We left-join the
 * invoice's project and bucket on `projects.type`; invoices without a
 * project (e.g. one-off renderings, quick estimates) fall into
 * `Unassigned`.
 */
export async function getInvoiceCategoryBreakdown(): Promise<InvoiceCategoryBucket[]> {
  const rows = await db
    .select({
      projectType: projects.type,
      total: sum(invoices.amountCents).mapWith(Number),
      count: count(),
    })
    .from(invoices)
    .leftJoin(projects, eq(projects.id, invoices.projectId))
    .groupBy(projects.type);

  // Project enum is `'maintenance' | 'remodel'`. The left-join can also
  // surface NULL when the invoice has no project link.
  const labelFor = (raw: 'maintenance' | 'remodel' | null): InvoiceCategory => {
    if (raw === 'remodel') return 'Remodel';
    if (raw === 'maintenance') return 'Maintenance';
    return 'Unassigned';
  };

  // Stable order across renders so the pie + legend don't reshuffle —
  // Remodel first (typically the largest dollar slice), Maintenance,
  // Unassigned last.
  const order: InvoiceCategory[] = ['Remodel', 'Maintenance', 'Unassigned'];
  const totals = new Map<InvoiceCategory, { totalCents: number; invoiceCount: number }>();
  for (const row of rows) {
    const label = labelFor(row.projectType);
    const amount = row.total ?? 0;
    if (amount === 0) continue;
    const existing = totals.get(label);
    if (existing) {
      existing.totalCents += amount;
      existing.invoiceCount += Number(row.count);
    } else {
      totals.set(label, { totalCents: amount, invoiceCount: Number(row.count) });
    }
  }

  return order
    .map<InvoiceCategoryBucket | null>((category) => {
      const bucket = totals.get(category);
      if (!bucket) return null;
      return {
        category,
        totalCents: bucket.totalCents,
        invoiceCount: bucket.invoiceCount,
      };
    })
    .filter((b): b is InvoiceCategoryBucket => b !== null);
}

export async function getInvoiceSummaryAll(): Promise<InvoiceSummaryAll> {
  const rows = await db
    .select({
      status: invoices.status,
      total: sum(invoices.amountCents).mapWith(Number),
      count: count(),
    })
    .from(invoices)
    .groupBy(invoices.status);

  let totalInvoiced = 0;
  let totalPaid = 0;
  let totalOutstanding = 0;
  let invoiceCount = 0;

  for (const row of rows) {
    const amount = row.total ?? 0;
    invoiceCount += Number(row.count);
    totalInvoiced += amount;
    if (row.status === 'paid') totalPaid += amount;
    else totalOutstanding += amount;
  }

  return { totalInvoiced, totalPaid, totalOutstanding, invoiceCount };
}

// ---------------------------------------------------------------------------
// Invoice activity over time — drives the bar+line chart on the
// /admin/invoices page. Three preset buckets: daily / weekly / monthly.
// ---------------------------------------------------------------------------

export type InvoiceActivityBucket = 'daily' | 'weekly' | 'monthly';

export interface InvoiceActivityPoint {
  /** ISO `YYYY-MM-DD` for daily, ISO `YYYY-MM-DD` of the week's Monday
   *  (ISO week start) for weekly, `YYYY-MM-01` for monthly. */
  period: string;
  /** Total invoiced amount in cents for the period. */
  amount: number;
  /** Number of invoices in the period. */
  count: number;
}

interface BucketShape {
  /** Postgres `date_trunc` unit. */
  unit: 'day' | 'week' | 'month';
  /** How many of `unit` to look back from today (inclusive of today). */
  windowSize: number;
}

const BUCKET_CONFIG: Record<InvoiceActivityBucket, BucketShape> = {
  daily: { unit: 'day', windowSize: 30 },
  weekly: { unit: 'week', windowSize: 12 },
  monthly: { unit: 'month', windowSize: 12 },
};

/**
 * Aggregate invoiced amounts + counts per bucket. Uses Postgres'
 * `date_trunc` to canonicalise the period for grouping; the cutoff
 * boundary is computed in JS (no library) and passed as a parameter.
 *
 * Empty periods inside the window are filled in with zero rows so the
 * chart axis stays evenly spaced even on sparse data — a missing month
 * reads as a zero bar, not a gap.
 */
export async function getInvoiceActivity(
  bucket: InvoiceActivityBucket,
): Promise<InvoiceActivityPoint[]> {
  const shape = BUCKET_CONFIG[bucket];
  const now = new Date();
  const since = computeWindowStart(now, shape);

  // GROUP BY date_trunc('<unit>', invoice_date). The unit is inlined
  // via `sql.raw` instead of a parameter — when Drizzle parameterises
  // the literal, Postgres treats each `$N` placeholder as its own
  // expression and rejects the GROUP BY with
  //   column "invoices.invoice_date" must appear in the GROUP BY
  // because SELECT's `date_trunc($1, …)` and GROUP BY's
  // `date_trunc($3, …)` are not textually identical at parse time.
  // Inlining the unit keeps the fragment text identical across the
  // three clauses; safe because `shape.unit` is constrained to the
  // 'day' | 'week' | 'month' enum (never user input).
  const trunc = sql<Date>`date_trunc('${sql.raw(shape.unit)}', ${invoices.invoiceDate})`;

  const rows = await db
    .select({
      period: trunc,
      amount: sum(invoices.amountCents).mapWith(Number),
      count: count(),
    })
    .from(invoices)
    .where(gte(invoices.invoiceDate, isoDate(since)))
    .groupBy(trunc)
    .orderBy(trunc);

  // Fill missing periods so the axis stays evenly stepped. The DB
  // returns whatever periods actually have invoices; we walk forward
  // from `since` to today and zero-fill anything else.
  const periods = enumeratePeriods(since, now, shape);
  const byKey = new Map<string, InvoiceActivityPoint>();
  for (const r of rows) {
    const key = isoDate(toDate(r.period));
    byKey.set(key, {
      period: key,
      amount: Number(r.amount ?? 0),
      count: Number(r.count),
    });
  }
  return periods.map(
    (p) => byKey.get(p) ?? { period: p, amount: 0, count: 0 },
  );
}

/** First day of the window — N units back from `now`, truncated to the
 *  unit's natural boundary so the GROUP BY periods align with the
 *  enumeration. */
function computeWindowStart(now: Date, shape: BucketShape): Date {
  const d = new Date(now);
  if (shape.unit === 'day') {
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - (shape.windowSize - 1));
    return d;
  }
  if (shape.unit === 'week') {
    // Match Postgres' `date_trunc('week', ...)` which anchors to Monday.
    d.setHours(0, 0, 0, 0);
    const dow = d.getDay(); // 0=Sun..6=Sat
    const offsetToMonday = dow === 0 ? -6 : 1 - dow;
    d.setDate(d.getDate() + offsetToMonday);
    d.setDate(d.getDate() - 7 * (shape.windowSize - 1));
    return d;
  }
  // Monthly — first of the month, N-1 months back.
  d.setHours(0, 0, 0, 0);
  d.setDate(1);
  d.setMonth(d.getMonth() - (shape.windowSize - 1));
  return d;
}

/** Enumerate every period start in [since, now] inclusive. Returns
 *  ISO `YYYY-MM-DD` strings — same format the GROUP BY's
 *  `date_trunc` returns when serialised. */
function enumeratePeriods(since: Date, now: Date, shape: BucketShape): string[] {
  const out: string[] = [];
  const cursor = new Date(since);
  while (cursor.getTime() <= now.getTime()) {
    out.push(isoDate(cursor));
    if (shape.unit === 'day') cursor.setDate(cursor.getDate() + 1);
    else if (shape.unit === 'week') cursor.setDate(cursor.getDate() + 7);
    else cursor.setMonth(cursor.getMonth() + 1);
  }
  return out;
}

function isoDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = (d.getMonth() + 1).toString().padStart(2, '0');
  const dd = d.getDate().toString().padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** Drizzle returns `date_trunc` results as Date instances when mapped
 *  via the implicit timestamp coercion; this helper just guards
 *  against the string-shaped fallback some pg drivers emit. */
function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}
