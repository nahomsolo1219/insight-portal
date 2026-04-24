'use client';

import { createContext, useContext } from 'react';
import type { BuilderMilestone, BuilderPhase } from './builder-types';

/**
 * Node-level callbacks exposed via context rather than packed into each
 * node's `data`. Putting callbacks on `data` forces React Flow to rewrite
 * every node on each keystroke — losing input focus. Via context, node
 * data stays stable and only the callbacks that actually change (by ref)
 * trigger updates in consumers.
 */
export interface BuilderContextValue {
  updatePhase: (phaseId: string, patch: Partial<BuilderPhase>) => void;
  deletePhase: (phaseId: string) => void;
  addMilestone: (phaseId: string, milestone: BuilderMilestone) => void;
  updateMilestone: (
    phaseId: string,
    milestoneId: string,
    patch: Partial<BuilderMilestone>,
  ) => void;
  deleteMilestone: (phaseId: string, milestoneId: string) => void;
  toggleExpanded: (phaseId: string) => void;
  isExpanded: (phaseId: string) => boolean;
}

const Ctx = createContext<BuilderContextValue | null>(null);

export const BuilderProvider = Ctx.Provider;

export function useBuilder(): BuilderContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useBuilder must be used within a BuilderProvider');
  return ctx;
}
