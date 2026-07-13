// State-aware subtitle copy for the property-scoped dashboard hero.
//
// Pure function — no I/O, no side effects, no React. Mirrors the shape of
// the landing's selectHeroCopy but operates on a single property's
// rolled-up state.
//
// Tests: none. The repo has no test framework configured (same situation
// as /portal/heroCopy.ts). The priority branches below map 1:1 to test
// cases — see the inline comments labelled "Priority N" — if a test
// framework lands later.
//
// ---------------------------------------------------------------------------
// Precedence (first match wins)
// ---------------------------------------------------------------------------
//   1. flagged              — statusTone === 'rose'
//   2. decisions waiting    — pendingDecisionCount > 0
//   3. recent visit done    — visit completed today or yesterday
//   4. upcoming visit       — nextScheduledVisit exists
//   5. steady cadence       — activeProjectCount > 0
//   6. calm (fallback)      — everything else

export type DashboardHeroTone = 'urgent' | 'caretaking' | 'steady' | 'calm';

export interface DashboardHeroCopy {
  text: string;
  tone: DashboardHeroTone;
}

/** Subset of the `properties.status_tone` enum we actually branch on. */
export type DashboardStatusTone = 'green' | 'amber' | 'neutral' | 'rose';

export interface DashboardHeroDecision {
  /** Project name the decision belongs to — drives the "on the {projectName}"
   *  phrasing in the priority-2 copy. */
  projectName: string | null;
}

export interface DashboardHeroVisit {
  /** ISO date "YYYY-MM-DD". */
  date: string;
  visitorFirstName: string | null;
}

export interface DashboardHeroInput {
  statusTone: DashboardStatusTone | null;
  statusLabel: string | null;
  pendingDecisionCount: number;
  /** Used in the priority-2 single-decision branch when count === 1. */
  pendingDecision: DashboardHeroDecision | null;
  mostRecentCompletedVisit: DashboardHeroVisit | null;
  nextScheduledVisit: DashboardHeroVisit | null;
  activeProjectCount: number;
  /** "Today" — pass an ISO date so the function stays pure (no `new Date()`
   *  inside). The caller usually passes `new Date().toISOString().slice(0, 10)`. */
  todayIso: string;
}

/**
 * Pick the editorial subtitle for the dashboard hero based on a single
 * property's state. See the priority order above.
 *
 * The function is pure: every "today is X" answer is derived from the
 * caller-supplied `todayIso`, so the same input always produces the same
 * output. Defensive defaults at every branch — a missing visitor name or
 * project name falls through to the impersonal copy variant rather than
 * surfacing an empty `{}` slot.
 */
export function selectDashboardHeroCopy(input: DashboardHeroInput): DashboardHeroCopy {
  // Priority 1 — flagged. A rose-tone status is admin's signal that
  // something is genuinely off; it always wins, even over decisions
  // waiting. The chip elsewhere in the UI surfaces the statusLabel
  // verbatim — we deliberately don't echo it here so the hero copy
  // stays editorial rather than a literal restatement.
  if (input.statusTone === 'rose') {
    return {
      tone: 'urgent',
      text: 'This home is flagged for attention. Your Insight contact will follow up.',
    };
  }

  // Priority 2 — decisions waiting.
  if (input.pendingDecisionCount > 0) {
    if (input.pendingDecisionCount === 1) {
      const projectName = input.pendingDecision?.projectName?.trim();
      if (projectName) {
        return {
          tone: 'urgent',
          text: `1 decision needs your input on ${projectName}.`,
        };
      }
      return { tone: 'urgent', text: '1 decision needs your input.' };
    }
    return {
      tone: 'urgent',
      text: `${input.pendingDecisionCount} decisions need your input.`,
    };
  }

  // Priority 3 — recent visit completed within the last 1-2 days.
  // Same window as the query layer; this branch is only reachable when a
  // visit was actually completed today or yesterday.
  if (input.mostRecentCompletedVisit) {
    const dayWord = input.mostRecentCompletedVisit.date === input.todayIso
      ? 'today'
      : 'yesterday';
    const first = input.mostRecentCompletedVisit.visitorFirstName?.trim();
    if (first) {
      return {
        tone: 'caretaking',
        text: `${first} was on site ${dayWord}.`,
      };
    }
    return {
      tone: 'caretaking',
      text: `Your last visit was ${dayWord}.`,
    };
  }

  // Priority 4 — upcoming visit.
  if (input.nextScheduledVisit) {
    const visit = input.nextScheduledVisit;
    const first = visit.visitorFirstName?.trim();
    if (visit.date === input.todayIso) {
      if (first) {
        return {
          tone: 'steady',
          text: `${first} is visiting today.`,
        };
      }
      return {
        tone: 'steady',
        text: 'A visit is scheduled for today.',
      };
    }

    const days = daysBetweenIso(input.todayIso, visit.date);
    const month = monthName(visit.date);
    const day = dayOfMonth(visit.date);
    if (days != null && days >= 0 && days <= 7 && month && day != null) {
      const weekday = dayOfWeek(visit.date);
      if (weekday) {
        return {
          tone: 'steady',
          text: `Next visit: ${weekday}, ${month} ${day}.`,
        };
      }
    }
    if (month && day != null) {
      return {
        tone: 'steady',
        text: `Next visit: ${month} ${day}.`,
      };
    }
    // Date parse failed somewhere — treat it as if there were no visit.
  }

  // Priority 5 — active work.
  if (input.activeProjectCount > 0) {
    const n = input.activeProjectCount;
    return {
      tone: 'steady',
      text: `${n} active project${n === 1 ? '' : 's'}. Nothing needs your input right now.`,
    };
  }

  // Priority 6 — idle / calm fallback.
  return {
    tone: 'calm',
    text: 'Nothing needs your attention right now.',
  };
}

// ---------------------------------------------------------------------------
// Pure date helpers (kept inline so the file has no I/O dependencies)
// ---------------------------------------------------------------------------

/** Parse "YYYY-MM-DD" into local-tz components without going through the
 *  `new Date(iso)` UTC trap that bites the rest of the portal. */
function parseLocalIso(iso: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const y = Number.parseInt(m[1]!, 10);
  const mm = Number.parseInt(m[2]!, 10);
  const d = Number.parseInt(m[3]!, 10);
  if (!Number.isFinite(y) || !Number.isFinite(mm) || !Number.isFinite(d)) return null;
  return { y, m: mm, d };
}

function dayOfWeek(iso: string): string | null {
  const parts = parseLocalIso(iso);
  if (!parts) return null;
  return new Date(parts.y, parts.m - 1, parts.d).toLocaleDateString('en-US', {
    weekday: 'long',
  });
}

function monthName(iso: string): string | null {
  const parts = parseLocalIso(iso);
  if (!parts) return null;
  return new Date(parts.y, parts.m - 1, parts.d).toLocaleDateString('en-US', {
    month: 'long',
  });
}

function dayOfMonth(iso: string): number | null {
  const parts = parseLocalIso(iso);
  return parts ? parts.d : null;
}

/** Whole-day distance between two YYYY-MM-DD strings. Returns null on
 *  malformed input. Negative when `to` is before `from`. */
function daysBetweenIso(fromIso: string, toIso: string): number | null {
  const a = parseLocalIso(fromIso);
  const b = parseLocalIso(toIso);
  if (!a || !b) return null;
  const aMs = Date.UTC(a.y, a.m - 1, a.d);
  const bMs = Date.UTC(b.y, b.m - 1, b.d);
  return Math.round((bMs - aMs) / (24 * 60 * 60 * 1000));
}
