// Append-only audit log helper. Every Server Action that changes state
// should call this after its Drizzle write. Failures are logged but never
// thrown — a broken audit log must not block a user action.
//
// The `action` union is intentionally restrictive so we get a grep-able
// catalogue of every mutation the portal can perform. Add new action strings
// as new features land; don't use freeform strings.

import 'server-only';

import { db } from '@/db';
import { auditLog } from '@/db/schema';
import type { CurrentUser } from '@/lib/auth/current-user';

export type AuditAction =
  | 'created client'
  | 'updated client'
  | 'archived client'
  | 'created property'
  | 'updated property'
  | 'deleted property'
  | 'uploaded property cover photo'
  | 'removed property cover photo'
  | 'created project'
  | 'updated project'
  | 'completed project'
  | 'deleted project'
  | 'assigned staff to project'
  | 'unassigned staff from project'
  | 'added milestone'
  | 'marked milestone complete'
  | 'updated milestone'
  | 'deleted milestone'
  | 'requested decision from client'
  | 'responded to decision'
  | 'created appointment'
  | 'completed appointment'
  | 'cancelled appointment'
  | 'updated appointment status'
  | 'deleted appointment'
  | 'uploaded photo'
  | 'categorized photo'
  | 'rejected photo'
  | 'deleted photo'
  | 'uploaded report'
  | 'deleted report'
  | 'uploaded invoice'
  | 'updated invoice status'
  | 'deleted invoice'
  | 'uploaded document'
  | 'deleted document'
  | 'posted weekly update'
  | 'added vendor'
  | 'updated vendor'
  | 'uploaded vendor document'
  | 'updated vendor document'
  | 'deleted vendor document'
  | 'invited staff'
  | 'updated staff'
  | 'invited client'
  | 'updated settings'
  | 'created tier'
  | 'updated tier'
  | 'deleted tier'
  | 'created template'
  | 'updated template'
  | 'deleted template';

export type AuditTargetType =
  | 'client'
  | 'property'
  | 'project'
  | 'milestone'
  | 'appointment'
  | 'photo'
  | 'report'
  | 'invoice'
  | 'document'
  | 'weekly_update'
  | 'vendor'
  | 'vendor_document'
  | 'staff'
  | 'tier'
  | 'template'
  | 'settings';

export interface LogAuditParams {
  actor: Pick<CurrentUser, 'id' | 'fullName'>;
  action: AuditAction;
  targetType: AuditTargetType;
  targetId?: string;
  targetLabel: string;
  /**
   * The client whose scope this action falls under. Powers
   * per-client activity feeds and client-scoped audit filtering. Leave null
   * for workspace-wide actions (e.g. tier edits, staff invites).
   */
  clientId?: string | null;
  metadata?: Record<string, unknown>;
}

export async function logAudit(params: LogAuditParams): Promise<void> {
  try {
    await db.insert(auditLog).values({
      actorId: params.actor.id,
      actorName: params.actor.fullName,
      action: params.action,
      targetType: params.targetType,
      targetId: params.targetId ?? null,
      targetLabel: params.targetLabel,
      clientId: params.clientId ?? null,
      metadata: params.metadata ?? null,
    });
  } catch (error) {
    // Intentionally swallowed — audit failures should never block user actions.
    console.error('[audit] Failed to log action:', params.action, error);
  }
}
