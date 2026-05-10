// Visit auto-distribution helper for the maintenance-plan builder.
//
// Given a date range and a visit count, returns a list of evenly-spaced
// dates plus a default title for each. The first visit lands on
// `startDate`; subsequent visits fall on `start + (k * span/(n-1))`
// rounded to the nearest day. The last visit lands on or just before
// `endDate` (never after — the rounding pulls in towards the
// midpoint).
//
// Two visits over a year => Q1 + Q3-ish.
// Four visits over a year => the canonical quarterly cadence.
// Twelve visits over a year => monthly.
//
// All inputs are YYYY-MM-DD strings (matching the DB `date` columns
// and the `<input type="date">` value shape) so this helper has no
// dependency on Date arithmetic at the boundary; conversion happens
// internally and the output goes back to YYYY-MM-DD.

export interface DistributedVisit {
  /** YYYY-MM-DD */
  scheduledDate: string;
  title: string;
  visitOrder: number;
}

export interface DistributeOptions {
  /** YYYY-MM-DD */
  startDate: string;
  /** YYYY-MM-DD */
  endDate: string;
  visitCount: number;
  /** Override the title generator. Defaults to "Visit {n}". When the
   *  count is 4 the helper labels them Q1 / Q2 / Q3 / Q4 instead. */
  titleFor?: (visitOrder: number, total: number) => string;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function distributeVisits({
  startDate,
  endDate,
  visitCount,
  titleFor,
}: DistributeOptions): DistributedVisit[] {
  if (visitCount <= 0) return [];

  const start = parseDate(startDate);
  const end = parseDate(endDate);
  if (!start || !end) return [];
  if (end.getTime() < start.getTime()) return [];

  const titleResolver = titleFor ?? defaultTitleFor;

  // Single visit => land it on startDate.
  if (visitCount === 1) {
    return [
      {
        scheduledDate: formatDate(start),
        title: titleResolver(1, 1),
        visitOrder: 0,
      },
    ];
  }

  const totalDays = Math.round((end.getTime() - start.getTime()) / MS_PER_DAY);
  const visits: DistributedVisit[] = [];

  for (let i = 0; i < visitCount; i++) {
    // i === 0 lands exactly on start; i === visitCount-1 on end.
    // Anything in between is an evenly-spaced midpoint, rounded to
    // the nearest day so the field shows a clean date.
    const fraction = i / (visitCount - 1);
    const dayOffset = Math.round(fraction * totalDays);
    const date = new Date(start.getTime() + dayOffset * MS_PER_DAY);
    visits.push({
      scheduledDate: formatDate(date),
      title: titleResolver(i + 1, visitCount),
      visitOrder: i,
    });
  }

  return visits;
}

function defaultTitleFor(visitOrder: number, total: number): string {
  if (total === 4) return `Q${visitOrder} Visit`;
  return `Visit ${visitOrder}`;
}

function parseDate(value: string): Date | null {
  // YYYY-MM-DD only — no TZ shifts. We construct a UTC midnight Date
  // so day arithmetic isn't pulled around by local TZ when the
  // server runs in non-UTC.
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, y, m, d] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Compute a sensible default end date for a plan based on its
 *  duration mode. Used by the plan-builder Step 1 when admin picks
 *  "Calendar year" / "Rolling 12 months" / "Custom". */
export function computeDefaultEndDate(
  startDate: string,
  duration: 'calendar_year' | 'rolling_12' | 'custom',
): string {
  const start = parseDate(startDate);
  if (!start) return startDate;

  if (duration === 'calendar_year') {
    // Dec 31 of the start year — keeps the plan name "{Year} Plan"
    // honest even if admin onboards mid-year.
    return formatDate(
      new Date(Date.UTC(start.getUTCFullYear(), 11, 31)),
    );
  }
  if (duration === 'rolling_12') {
    // 12 months from start, minus a day so the end-on date itself is
    // covered (start = Apr 14 -> end = Apr 13 next year).
    const end = new Date(start.getTime());
    end.setUTCFullYear(end.getUTCFullYear() + 1);
    end.setUTCDate(end.getUTCDate() - 1);
    return formatDate(end);
  }
  return startDate; // custom — caller picks
}
