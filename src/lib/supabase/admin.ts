// Service-role Supabase client. Bypasses RLS — only use from
// admin-gated Server Actions, and NEVER expose the service role key
// to the browser. This factory was duplicated across three actions
// files (admin/staff, admin/clients/[id], portal/projects/[id]) and
// extracted in the Phase 2A carry-over commit.
//
// The same factory works for `auth.admin.*` invitations (staff) and
// for storage uploads that need to bypass bucket-level RLS (cover
// photos, ZIP exports). Don't add anything to this module — keep it
// a thin pass-through so the security review surface stays tiny.

import 'server-only';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';

export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
