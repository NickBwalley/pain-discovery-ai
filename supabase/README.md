# Fresh database setup

Run these files **once, in this exact order**, in the Supabase SQL Editor as the database administrator. Run each entire file, including its `begin` and `commit` statements.

1. [`20261027000100_schema.sql`](migrations/20261027000100_schema.sql) — tables, indexes, source defaults and initial RLS protection.
2. [`20261027000200_auth_and_rls.sql`](migrations/20261027000200_auth_and_rls.sql) — public signup profiles, unique usernames and private per-user access policies.
3. [`20261027000300_operations.sql`](migrations/20261027000300_operations.sql) — worker queue, scheduling, retention/removal guards, outreach RPCs and final access grants.

These are the complete fresh-install migrations. They require no owner email, owner UUID, placeholder replacement, or additional setup SQL. Supabase supplies its Auth schema and the `anon`, `authenticated` and `service_role` roles. Accounts already present in Supabase Auth receive profiles during step 2.

Alternatively, link your project with the Supabase CLI and run `supabase db push`; it applies the files in filename order. For a fresh local Supabase instance, use `supabase start` and `supabase db reset`.

After the SQL completes, enable email signup/confirmation and Google in **Authentication → Providers**, configure the app origin and `/auth/callback` redirect URLs, then fill in the environment values described in the [main README](../README.md). These provider settings are configured in Supabase, not through these SQL files.

Any confirmed account can use its own workspace. Hacker News and permission-confirmed manual import are enabled; other source policies remain disabled until their documented authorization requirements are met. No research findings or demo accounts are seeded.
