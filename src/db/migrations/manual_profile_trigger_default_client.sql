-- Manual migration — applied OUT OF BAND (see src/db/migrations/README.md and
-- docs/MIGRATIONS.md). Like manual_profile_trigger.sql, this touches a function
-- + trigger that back onto auth.users, which drizzle-kit cannot manage.
--
-- Apply with:
--   npx tsx scripts/apply-manual-sql.ts manual_profile_trigger_default_client.sql
-- or paste into the Supabase SQL Editor.
--
-- WHY THIS EXISTS
-- ---------------
-- The original manual_profile_trigger.sql defaulted any new auth.users row
-- with no `role` in its metadata to role = 'admin', so the bootstrap account
-- (David) could reach the dashboard on a fresh project. That default is unsafe
-- now that invite flows are live: any user who somehow lands in auth.users
-- without role metadata (a hand-created Supabase dashboard user, a future auth
-- path, or sign-ups if they were ever re-enabled) would silently become an
-- admin.
--
-- This migration re-defines public.handle_new_user() so the fallback role is
-- 'client' instead of 'admin'. It is fail-SAFE: least privilege (never grants
-- admin by accident), non-breaking (the INSERT still succeeds, so no auth flow
-- errors out), and harmless (a client with a NULL client_id just sees an
-- empty-state portal — no cross-tenant data, since every portal query filters
-- by client_id and RLS enforces it).
--
-- The invite path does NOT rely on this default: inviteUser() passes
-- { role, full_name } in user_metadata to inviteUserByEmail(), so an invited
-- client always lands with role = 'client' via the COALESCE's first branch;
-- clientId is then set by an explicit follow-up UPDATE in inviteUser(). The
-- only rows this default touches are those created with no role metadata at all.
--
-- CREATE OR REPLACE keeps this idempotent and re-runnable; re-installing the
-- trigger is safe.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    -- Fallback is 'client' (was 'admin'): never grant admin to a user that
    -- arrived without an explicit role. client_id stays NULL → empty portal.
    COALESCE((NEW.raw_user_meta_data->>'role')::public.user_role, 'client'::public.user_role)
  );
  RETURN NEW;
END;
$$;

-- Idempotent re-install so re-running the file is safe.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
