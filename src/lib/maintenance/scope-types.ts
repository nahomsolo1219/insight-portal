// Controlled vocabulary for maintenance-visit scope items. Stored on
// `maintenance_visit_scope_items.scope_type` as text — the application
// layer validates against this list. Adding a new entry here is a code
// change, not a migration.
//
// Each entry maps a stable `value` (what lands in the DB column) to a
// human-readable `label` and a Lucide icon name (resolved by the UI to
// the matching component). When `value === 'custom'`, the row's
// `custom_label` column carries the admin-authored label instead.

import type { LucideIcon } from 'lucide-react';
import {
  Bug,
  Cpu,
  Droplets,
  Flame,
  Hammer,
  Home,
  Leaf,
  Plug,
  ShieldCheck,
  Waves,
} from 'lucide-react';

export interface ScopeType {
  value: string;
  label: string;
  /** Lucide icon component; rendered at 14px in chips, 18px in cards. */
  icon: LucideIcon;
}

export const SCOPE_TYPES: readonly ScopeType[] = [
  { value: 'hvac', label: 'HVAC service', icon: Flame },
  { value: 'plumbing', label: 'Plumbing inspection', icon: Droplets },
  { value: 'electrical', label: 'Electrical check', icon: Plug },
  { value: 'roof_exterior', label: 'Roof / exterior inspection', icon: Home },
  { value: 'appliances', label: 'Appliance check', icon: Cpu },
  { value: 'pest_control', label: 'Pest control', icon: Bug },
  { value: 'landscape', label: 'Landscape / irrigation', icon: Leaf },
  { value: 'security_smart', label: 'Security / smart home', icon: ShieldCheck },
  { value: 'pool_spa', label: 'Pool / spa service', icon: Waves },
  { value: 'custom', label: 'Custom item', icon: Hammer },
] as const;

export const SCOPE_TYPE_VALUES: readonly string[] = SCOPE_TYPES.map((s) => s.value);

const BY_VALUE = new Map<string, ScopeType>(SCOPE_TYPES.map((s) => [s.value, s]));

export function getScopeType(value: string): ScopeType | undefined {
  return BY_VALUE.get(value);
}

/** Resolve the display label for a stored row. Falls back to the
 *  built-in label when scope_type !== 'custom'; uses custom_label
 *  when scope_type === 'custom'; and "Custom item" if a custom row
 *  has no label populated yet. */
export function resolveScopeLabel(
  scopeType: string,
  customLabel: string | null,
): string {
  if (scopeType === 'custom') return customLabel?.trim() || 'Custom item';
  return getScopeType(scopeType)?.label ?? scopeType;
}

/** Default scope assigned to auto-generated visits when admin doesn't
 *  pick anything. Mirrors what David typically does on a quarterly
 *  visit — HVAC + plumbing + electrical sweep. Adjust here, not in
 *  the action call sites. */
export const DEFAULT_SCOPE_TYPES: readonly string[] = [
  'hvac',
  'plumbing',
  'electrical',
];

export type { LucideIcon };
