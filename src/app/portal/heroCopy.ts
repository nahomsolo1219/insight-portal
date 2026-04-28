// State-aware subtitle copy for the editorial /portal landing page.
//
// Pure function — no I/O, no side effects, no React. Operates on the
// `PropertyLandingCard[]` already fetched by the page.
//
// Tests: none. The repo has no test framework configured (no vitest /
// jest / test script in package.json, no existing *.test.* files).
// Adding one for a single ~80-line file isn't worth the dependency
// surface; the function is small, pure, and easy to read through. If
// a test framework lands later, the priority branches below map 1:1
// to test cases — see the inline comments labelled "Priority N".
//
// ---------------------------------------------------------------------------
// Precedence (first match wins)
// ---------------------------------------------------------------------------
//   1. flagged              — any card has statusTone === 'rose'
//   2. decisions waiting    — sum(pendingDecisionCount) > 0
//   3. mixed dormant + active — at least one of each
//   4. steady cadence       — any card has activeProjectCount > 0
//   5. calm (fallback)      — everything else
//
// "Dormant" is derived locally as
//   `statusTone === 'neutral' && activeProjectCount === 0`
// because the card data doesn't carry an explicit dormant flag.

import type { PropertyLandingCard } from './queries';

export type HeroTone = 'urgent' | 'mixed' | 'steady' | 'calm';

export interface HeroCopyResult {
  text: string;
  tone: HeroTone;
}

const FALLBACK_NAME = 'one of your homes';

/**
 * Pick the editorial subtitle for the landing hero based on the
 * cross-portfolio state in `cards`. See module header for the
 * precedence rules.
 *
 * The returned `tone` is intentionally surfaced for future visual
 * variation (e.g. tone-based color); the current page consumes only
 * `text` and renders it in a neutral ink-500 italic.
 */
export function selectHeroCopy(cards: PropertyLandingCard[]): HeroCopyResult {
  // Priority 1 — flagged. A rose-tone status is admin's signal that
  // something is genuinely off; it always wins, even over decisions
  // waiting. Per spec: if multiple are flagged, surface the first;
  // the per-card chips show the rest.
  const flagged = cards.find((c) => c.statusTone === 'rose');
  if (flagged) {
    return {
      tone: 'urgent',
      text: `Wanted to flag something on the ${propertyName(flagged)} property.`,
    };
  }

  // Priority 2 — decisions waiting. Sum across all cards so a
  // portfolio with one decision per property still rolls up correctly.
  const totalDecisions = cards.reduce((sum, c) => sum + c.pendingDecisionCount, 0);
  if (totalDecisions > 0) {
    if (totalDecisions === 1) {
      // Find the single property that owns the decision. Card data
      // doesn't carry the project name, so we always use the
      // property-only fallback copy here. Adding a separate join to
      // surface the project name would make this function impure +
      // require an async signature; deferred to a future pass if
      // the per-decision context becomes important.
      const owner = cards.find((c) => c.pendingDecisionCount === 1);
      const ownerName = owner ? propertyName(owner) : FALLBACK_NAME;
      return {
        tone: 'urgent',
        text: `One thing needs you on the ${ownerName} property.`,
      };
    }
    return {
      tone: 'urgent',
      text: `${totalDecisions} decisions are waiting across your homes.`,
    };
  }

  // Priority 3 — mixed dormant + active. "Dormant" requires an
  // explicit neutral-tone label from admin AND no active work; a
  // property that just happens to be quiet doesn't count.
  const dormant = cards.find(
    (c) => c.statusTone === 'neutral' && c.activeProjectCount === 0,
  );
  const active = cards.find((c) => c.activeProjectCount > 0);
  if (dormant && active && dormant.id !== active.id) {
    return {
      tone: 'mixed',
      text: `${propertyName(active)} is in motion; ${propertyName(dormant)} is resting for the season.`,
    };
  }

  // Priority 4 — steady cadence. Active project somewhere, nothing
  // urgent. The "nothing needs you today" half is the reassurance.
  if (active) {
    return {
      tone: 'steady',
      text: 'Work in motion across your homes — nothing needs you today.',
    };
  }

  // Priority 5 — calm. Also covers the empty-portfolio case; the
  // landing page renders an explicit empty-state card below the
  // hero in that branch, so the copy reading slightly off-context
  // is acceptable.
  return {
    tone: 'calm',
    text: 'Everything is calm. Pick a home to look in on.',
  };
}

/**
 * Defensive name accessor — null / empty / whitespace-only names
 * fall back so the rendered string never reads as "the  property"
 * or surfaces an unresolved template literal.
 */
function propertyName(card: PropertyLandingCard): string {
  const trimmed = card.name?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : FALLBACK_NAME;
}
