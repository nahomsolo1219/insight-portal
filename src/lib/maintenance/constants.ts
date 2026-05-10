// Pure constants + types for the maintenance surface. No runtime
// dependency on `@/db` so this module is safe to import from client
// components — `queries.ts` re-exports these for the server-side
// callers, but client code that just needs the controlled vocabulary
// (status filter, billing cadence picker, etc.) imports here.

export type PlanStatus = 'draft' | 'active' | 'archived' | 'completed';

export type VisitStatus =
  | 'scheduled'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export type BillingCadence = 'annual' | 'monthly' | 'quarterly' | 'per_visit';

export const PLAN_STATUSES: readonly PlanStatus[] = [
  'draft',
  'active',
  'archived',
  'completed',
] as const;

export const VISIT_STATUSES: readonly VisitStatus[] = [
  'scheduled',
  'in_progress',
  'completed',
  'cancelled',
] as const;

export const BILLING_CADENCES: readonly BillingCadence[] = [
  'annual',
  'monthly',
  'quarterly',
  'per_visit',
] as const;
