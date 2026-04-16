// Supabase client for Client Components. Uses the browser's cookie store
// automatically via @supabase/ssr. Only import this from `'use client'` files.

import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
