import type { Node } from '@xyflow/react';

export type DecisionType = 'single' | 'multi' | 'approval' | 'open' | 'acknowledge';
export type PhotoDocumentation =
  | 'none'
  | 'before_after'
  | 'before_during_after'
  | 'during_only';

/**
 * In-memory shape for a single milestone inside the builder. Keeps both
 * regular milestones and decision points in the same array (distinguished
 * by `isDecisionPoint`) so save/load goes through one code path.
 *
 * `id` is a client-generated UUID for React keys and edge refs. The server
 * ignores it on save — DB assigns fresh UUIDs.
 */
export interface BuilderMilestone {
  id: string;
  title: string;
  category: string;
  description: string;
  isDecisionPoint: boolean;
  decisionQuestion: string;
  decisionType: DecisionType | '';
  decisionOptions: string[];
}

export interface BuilderPhase {
  id: string;
  title: string;
  description: string;
  estimatedDuration: string;
  estimatedDays: number | null;
  photoDocumentation: PhotoDocumentation;
  milestones: BuilderMilestone[];
}

/**
 * Node data augments the phase with a transient `phaseNumber` used by the
 * node UI (the teal "1/2/3" badge on each card). It's derived from node
 * order by the canvas wrapper — not persisted.
 *
 * The `Record<string, unknown>` intersection is a TypeScript tax for
 * React Flow's `Node<TData>` generic, which constrains data to an indexed
 * object. Every field keeps its concrete type via the first intersection.
 */
export type PhaseNodeData = BuilderPhase & { phaseNumber: number } & Record<string, unknown>;

export type PhaseNode = Node<PhaseNodeData, 'phase'>;

/** Factory for a blank milestone row. Client-only; server re-assigns IDs. */
export function newMilestone(partial?: Partial<BuilderMilestone>): BuilderMilestone {
  return {
    id: genId(),
    title: '',
    category: '',
    description: '',
    isDecisionPoint: false,
    decisionQuestion: '',
    decisionType: '',
    decisionOptions: [],
    ...partial,
  };
}

export function newPhase(partial?: Partial<BuilderPhase>): BuilderPhase {
  return {
    id: genId(),
    title: '',
    description: '',
    estimatedDuration: '',
    estimatedDays: null,
    photoDocumentation: 'before_during_after',
    milestones: [],
    ...partial,
  };
}

function genId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback for legacy browsers — never hit in modern Chrome/Safari/Firefox.
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
