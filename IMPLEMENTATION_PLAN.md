# Implementation plan

## Audit (Phase 0)
The repository contains only AGENTS.md. There is no existing application, package manager, schema, or test suite to preserve. Use npm with a lockfile and Python 3.12 with a pyproject. Do not require credentials for unit tests. No seed findings in production metrics.

## Architecture and conventions
- Next.js App Router, strict TypeScript, Tailwind and shadcn-style accessible primitives. Server-rendered authenticated pages and server actions; Supabase SSR session cookies. Public signup; confirmed accounts receive private workspaces enforced by server operations and SQL RLS.
- Supabase PostgreSQL owns projects, queued jobs, source provenance, extractions, conservative clusters, manually reviewed prospects, drafts, interview notes, source policies and global suppression. SQL migrations include indexes, constraints, RLS and atomic job claims.
- Python 3.12 CLI worker claims bounded jobs and uses the official Hacker News Firebase API, plus optional exact public pages with administrator-recorded permission and robots checks. A local worker loop or GitHub Actions drains the same queue. No Python execution inside Vercel.
- Manual import stores explicitly permitted pasted text plus a URL; it never fetches that URL. All network destinations are fixed official HN or operator-configured trusted AI/Supabase endpoints.
- OpenRouter-compatible HTTP client uses opt-in AI, versioned prompts, strict Pydantic/Zod schemas, bounded retries, exact evidence validation and conservative evidence-only fact fields. Unknown values score zero.
- Worker uses a server-only service key and independently checks owner context. Research web operations use cookie sessions/RLS; an isolated server-only username lookup uses a service key. Source text cannot select tools or change permissions.
- Research UI: ink/ivory/copper workbench, clear source quotations, real counters, readable empty/error states, responsive dark/light themes. No fake dashboard data.

## Ordered milestones
1. **Phase 1: vertical slice** — bootstrap app and auth, full schema/RLS, project CRUD, queue action, HN and manual connectors, normalization/dedup, mockable extraction/scoring/persistence, dashboard/feed/detail. Validate lint, TypeScript/build and Python unit/integration tests.
2. **Phase 2: analysis quality** — strict AI provenance and conservative clustering, unknown buyer distinction, hallucination/adversarial/alternative/dedup tests. Publish test results and limitations.
3. **Phase 3: prospect workflow** — manual shortlist and identity review, source-grounded draft generation, review/edit/copy/status and interviews, global opt-out. Verify generation and copy guards.
4. **Phase 4: operations** — scheduled worker, atomic claims and stale-job recovery, incremental bounded collection, retry/backoff, caps/token budget, purge/delete, source manifests and disabled-source reasons, dry-run. Verify mocked operational cases.
5. **Phase 5: hardening/deployment** — auth and RLS tests, input/URL security, expensive-action limits, CI and optional scheduled GitHub workflow, setup/deployment/cost documentation. Run all available checks; explicitly distinguish local tests from credential-dependent live acceptance.

## Technical dependencies and configuration
Node 22+ and npm; Python 3.12; Next.js/React/TypeScript, Tailwind, Supabase JS/SSR, Zod, Radix Slot and class utilities; httpx/Pydantic/pytest. Supabase project URL, public anon key and app origin; server-only service role key for username lookup and the shared worker; configured OpenRouter-compatible API key/model/base URL. Optional scheduling requires GitHub secrets. External services are not provisioned by code.

## Definition of done
A signed-in owner can create a niche/problem/competitor project, enqueue an explicitly configured job, collect real official-API discussions or manually import permitted text, persist normalized deduplicated sources and validated exact evidence, see honest priority scores and conservative clusters, shortlist and review a candidate, generate an unsent grounded draft, edit/copy it after review, and track manual outcomes/interviews. Unauthorized users cannot read/write data; disabled sources never fetch; suppression and deletion propagate; failed configuration cannot produce false completion. README/env/migrations/worker/CI and meaningful tests ship together. Final report lists actual checks and any unverified live integration or acceptance requirements.


## October 27 initial requested changes (owner access superseded below)
Preserve the existing application. Add Google OAuth and email-confirmed username/password signup for the administrator-reserved owner email, keeping RLS. Store usernames in owner-only profiles and passwords in Supabase Auth. Use a fixed APP_URL for PKCE redirects. Replace weighted ranking with four equal 25-point categories and migrate saved scores. Add an opt-in exact-public-page connector with documented permission, fresh review, robots checks, DNS/IP pinning, TLS, response caps and no redirects. Keep G2/Capterra/Reddit disabled until applicable permissions and dedicated integrations exist. Update AGENTS.md, manifests, docs and auth/scoring/source-access tests. Do not add private-data harvesting or bypasses.


## Public-signup MVP update
Allow every confirmed Supabase account to register and use its own workspace through Google or username/email and password. Replace the singleton owner authorization helper with per-resource user ownership, preserve existing records, migrate profiles, and remove owner-email configuration. Keep global connector policies administrator-controlled. Resolve username sign-in only on the server through a service-only RPC; never expose an email directory. Make the worker claim queued jobs across verified accounts and bind every storage operation to the claimed job's user. Test two-account isolation, signup/callbacks, username collisions and worker ownership. Update auth copy, AGENTS.md, env, deployment/setup instructions and validation status. Source-access and manual-outreach restrictions remain in force.


## Fresh-install migration consolidation
The user has applied no migrations and authorizes rewriting the SQL history. Replace the four upgrade-oriented migrations with a clean numbered sequence: schema/source defaults, public auth/RLS, then operations/guards/grants. Define current multi-user profiles, equal-point score storage, source permissions and shared worker RPCs directly; remove singleton owner setup and upgrade-only score/profile transformations. Preserve current app/worker RPC names and final access restrictions. Update setup docs and tests to exercise a blank database in filename order, public signup, per-user isolation and queue behavior. Verify SQL via the embedded PostgreSQL suite plus lint/typecheck/build and Python tests.


## Simplified category research (current scope)
Replace the full workbench with sign-in -> one category multi-select -> Search -> real source results. Generate existing project title/context/keyword fields from bounded category presets; no new database migration. Queue only official-HN collection jobs with fixed caps and no paid AI calls. Show persisted discussions with original links, actual queued/running/error/empty states and automatic refresh. Remove advanced forms, sidebar, analytics, prospect/outreach/settings flows; redirect legacy screens to the new search entry. Retain existing records, source-access controls and tenant isolation. Verify category validation, action ownership/caps, escaped results, asynchronous refresh and mobile/desktop rendering using an isolated fixture backend; document fixture-vs-live limits. Update current guidance, setup instructions and live acceptance to the new flow.
