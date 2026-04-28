// Shared parser + URL-hydrator for the rich decision-option shape stored
// in `milestones.options` (and `template_milestones.decision_options`).
// Lives in `src/lib` so admin surfaces (decisions list, project detail
// timeline) can share one batch sign-URLs round-trip per page render.

import 'server-only';
import { getSignedUrls } from '@/lib/storage/upload';

export interface AdminDecisionOption {
  label: string;
  description: string | null;
  /** Pre-signed URL when the option carries an `imageStoragePath`; null
   *  when the option is text-only or the signer fails. */
  imageUrl: string | null;
}

/**
 * Parse a raw jsonb `options` column into the lossless shape the admin
 * surfaces consume. Tolerates the historical string[] form (legacy seed
 * data) and the rich `{ label, imageStoragePath, description }` object
 * form. Anything unparseable is dropped so a misshapen row can't break
 * the page.
 *
 * NOTE: Returns the storage path along with the label/description so a
 * caller can collect every path across many milestones into one batch
 * sign call. Use `hydrateOptionGroups` if you have grouped options to
 * sign in one round-trip.
 */
function parseRawOptions(
  raw: unknown,
): Array<{ label: string; description: string | null; imageStoragePath: string | null }> {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (typeof item === 'string') {
        return { label: item, description: null, imageStoragePath: null };
      }
      if (item && typeof item === 'object') {
        const obj = item as Record<string, unknown>;
        const label = typeof obj.label === 'string' ? obj.label : '';
        if (!label) return null;
        return {
          label,
          description:
            typeof obj.description === 'string' ? obj.description : null,
          imageStoragePath:
            typeof obj.imageStoragePath === 'string' ? obj.imageStoragePath : null,
        };
      }
      return null;
    })
    .filter(
      (
        x,
      ): x is {
        label: string;
        description: string | null;
        imageStoragePath: string | null;
      } => x !== null,
    );
}

/**
 * Hydrate the `options` jsonb on a list of decision-bearing rows in a
 * single batch — one storage round-trip even with dozens of options
 * across many milestones. Returns a Map<rowId, AdminDecisionOption[]>.
 *
 * The caller decides what to do with the unsignable paths (we just leave
 * `imageUrl` null and the UI falls back to text-only).
 */
export async function hydrateOptionGroups<T extends { id: string; options: unknown }>(
  rows: T[],
): Promise<Map<string, AdminDecisionOption[]>> {
  const parsedByRow = new Map<
    string,
    Array<{ label: string; description: string | null; imageStoragePath: string | null }>
  >();
  const allPaths: string[] = [];
  for (const row of rows) {
    const parsed = parseRawOptions(row.options);
    parsedByRow.set(row.id, parsed);
    for (const opt of parsed) {
      if (opt.imageStoragePath) allPaths.push(opt.imageStoragePath);
    }
  }

  const urlByPath =
    allPaths.length > 0 ? await getSignedUrls(allPaths) : new Map<string, string>();

  const out = new Map<string, AdminDecisionOption[]>();
  for (const [rowId, parsed] of parsedByRow) {
    out.set(
      rowId,
      parsed.map((p) => ({
        label: p.label,
        description: p.description,
        imageUrl: p.imageStoragePath
          ? urlByPath.get(p.imageStoragePath) ?? null
          : null,
      })),
    );
  }
  return out;
}
