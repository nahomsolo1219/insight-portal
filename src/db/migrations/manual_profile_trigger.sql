-- This migration lives OUTSIDE drizzle-kit's tracking (see
-- src/db/migrations/README.md). drizzle-kit cannot manage triggers on the
-- auth.users table because that schema is owned by Supabase Auth. Apply this
-- file by running `npx tsx scripts/apply-manual-sql.ts manual_profile_trigger.sql`
-- or by pasting it into the Supabase SQL Editor.
--
-- Filename uses a `manual_` prefix (not `000X_`) so it doesn't visually share
-- drizzle's numbered sequence.

-- When a new user signs up (via magic link, invite, or any other auth flow),
-- automatically create a matching row in public.profiles so that the rest of
-- the app can rely on a profile existing for every auth.users row.
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
    COALESCE((NEW.raw_user_meta_data->>'role')::public.user_role, 'admin'::public.user_role)
  );
  RETURN NEW;
END;
$$;

-- Idempotent install so re-running the file is safe.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
