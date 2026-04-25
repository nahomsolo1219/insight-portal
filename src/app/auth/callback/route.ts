// Magic-link / invite redirect target. Supabase sends the user here with a
// `?code=...` query param; we exchange that for a session cookie and then
// route based on the user's role.
//
// Routing rules:
// - Explicit `?next=` param wins (used when the user was deep-linked into a
//   protected route before logging in — middleware preserved the destination).
// - Otherwise the home page (`/`) decides per-role: admin → /admin, client →
//   /portal. Keeping a single redirect target here means we don't have to
//   duplicate role logic at every entry point.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
