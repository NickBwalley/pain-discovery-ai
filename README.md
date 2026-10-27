# Pain Discovery AI

A simple research app: **sign in, choose categories, press Search, explore the results**. Public signup supports Google or email/username and password. Every user has a private workspace.

## What the user sees

- One multi-select dropdown with Cyber security, B2B & SaaS, Startup founders, Software alternatives, AI & automation, Developer tools, Marketing & sales, E-commerce, Finance & accounting, and Hiring & people.
- One Search button. Select one to five categories; the app supplies the project name and search terms automatically.
- Actual public discussion results with dates, excerpts and original links. Queued/running searches update automatically; zero matches and failures stay explicit.

There are no project-title, ICP, keyword, source or budget fields, sidebar dashboards, prospect/outreach flows or settings screens. Search uses the official Hacker News connector and **does not require or trigger paid AI**. It samples recent discussions, not the entire web or all historical HN content. Nothing is sent or posted.

Existing database records are retained. Old workbench URLs redirect to the new search entry. No new migration is needed if the three current migrations are already applied.

## Architecture and prerequisites

| Component                | Implementation                                                               |
| ------------------------ | ---------------------------------------------------------------------------- |
| Web application          | Next.js App Router, TypeScript, Tailwind and shared UI components            |
| Authentication           | Supabase Auth: Google OAuth and email/password; unique usernames for sign-in |
| Database                 | Supabase PostgreSQL, SQL migrations and row-level security (RLS)             |
| Research worker          | Separate Python 3.12 CLI using httpx and Pydantic                            |
| Optional legacy analysis | OpenRouter-compatible API; not invoked by category Search                    |
| Deployment               | Next.js on Vercel, Supabase database/Auth, optional GitHub Actions worker    |

The browser queues a job in Supabase. A Python worker claims it, binds its operations to that job's user, collects eligible sources, optionally analyzes them, and saves results. Active searches refresh automatically to show progress. `npm run dev` starts the local website and Python worker together. The worker does not run inside Vercel functions.

You need:

- **Node.js 22+** with npm, and **Python 3.12** with pip and venv.
- A Supabase project with permission to run SQL and configure Auth.
- A Google OAuth client for Google sign-in.
- No AI account is needed for category searches. The retained analysis backend supports an OpenRouter-compatible provider, but that is outside the simplified UI.
- Custom SMTP for public confirmation emails on hosted Supabase; see step 3.

Run commands from the repository root. Windows examples use PowerShell and `npm.cmd` to avoid npm.ps1 execution-policy issues. Replace the example checkout path with your own.

## Step 1: Install the web dependencies

**Windows / PowerShell**

```powershell
Set-Location 'D:\MyProjects\AI-Projects\Pain-Discovery-AI'
node --version
npm.cmd --version
py -3.12 --version
npm.cmd ci
```

**macOS / Linux**

```bash
cd /path/to/Pain-Discovery-AI
node --version
npm --version
python3.12 --version
npm ci
```

If the Windows launcher `py` is unavailable, use your Python 3.12 executable's path for venv creation in step 6.

## Step 2: Create Supabase and run the migrations

1. Create a Supabase project and wait for its database to be ready.
2. Open its **SQL Editor** as the database administrator.
3. Run each complete file **once, in this exact order**, including its `begin` and `commit` statements:

| Order | File                                                                                   | Creates                                                                  |
| ----- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 1     | [20261027000100_schema.sql](supabase/migrations/20261027000100_schema.sql)             | Tables, indexes, source defaults and initial RLS protection              |
| 2     | [20261027000200_auth_and_rls.sql](supabase/migrations/20261027000200_auth_and_rls.sql) | Public signup profiles, unique usernames and per-user policies           |
| 3     | [20261027000300_operations.sql](supabase/migrations/20261027000300_operations.sql)     | Worker queue, scheduling, removal guards, outreach RPCs and final grants |

These files create the current application on a fresh database. **No owner setup script, owner email, owner UUID or SQL placeholder replacement is required.** Supabase supplies its Auth schema and API roles. Existing Auth accounts receive profiles during migration 2. No research findings or demo accounts are seeded.

If you already use the Supabase CLI, the alternative is:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

Use the SQL Editor sequence or the CLI-managed sequence for your installation. See [database setup](supabase/README.md) for details.

## Step 3: Configure email signup and app redirects

In Supabase Authentication settings:

1. Allow new users to sign up and enable the Email provider.
2. Keep email confirmation enabled.
3. Set **Site URL** to `http://localhost:3000` for local development.
4. Allow `http://localhost:3000/auth/callback` as a redirect URL.
5. For production, use your deployed origin, for example `https://research.example.com`, and allow `https://research.example.com/auth/callback`.

`APP_URL` must match the origin you use. Open confirmation links in the browser that started signup because the app uses PKCE. See [Supabase redirect configuration](https://supabase.com/docs/guides/auth/redirect-urls).

**For public email signup, configure custom SMTP.** Supabase's built-in email service restricts delivery to project-team addresses and is not a public production mail service. Configure your provider's SMTP host, port, credentials and verified sender in Supabase Auth. SMTP credentials belong in Supabase, not the app's env files. See [Supabase SMTP setup](https://supabase.com/docs/guides/auth/auth-smtp).

## Step 4: Configure Google sign-in

1. In Google Cloud, configure your OAuth application's audience/consent settings and create an OAuth client of type **Web application**.
2. Add your app origin, such as `http://localhost:3000`, to authorized JavaScript origins where required by the Google setup.
3. Add the **Supabase provider callback URL** to Google's authorized redirect URIs. A hosted project's URL normally looks like:

   ```text
   https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback
   ```

4. In Supabase **Authentication / Providers / Google**, enable Google and enter the client ID and client secret. Copy the exact provider callback from that panel.
5. Configure Google's testing/publishing audience for your intended users; testing can limit who may sign in.

| Configure this location        | With this callback                                      |
| ------------------------------ | ------------------------------------------------------- |
| Google OAuth                   | `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback` |
| Supabase allowed app redirects | `http://localhost:3000/auth/callback`                   |

Google credentials stay in Supabase. See the [official Google setup guide](https://supabase.com/docs/guides/auth/social-sign-in/auth-google).

## Step 5: Configure the environment files

Next.js reads `.env.local`. The local `npm run dev` and `npm run worker` launchers share Next.js environment precedence and use the web app's Supabase URL/key for the worker, so both processes target the same project. Direct Python CLI commands still load `.env`. Both files are ignored by Git; preserve existing credentials.

Create missing files from the template in PowerShell:

```powershell
if (!(Test-Path .env.local)) { Copy-Item .env.example .env.local }
if (!(Test-Path .env)) { Copy-Item .env.example .env }
```

On macOS/Linux:

```bash
if [ ! -f .env.local ]; then cp .env.example .env.local; fi
if [ ! -f .env ]; then cp .env.example .env; fi
```

Replace placeholders using your Supabase project and model-provider settings. These examples show which values each process needs.

### Web: `.env.local`

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_OR_PUBLISHABLE_KEY
APP_URL=http://localhost:3000
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVER_ONLY_SERVICE_ROLE_JWT
```

The server-only key enables username-to-email resolution for password sign-in. Without it, Google and email/password work, but username sign-in does not. Normal research data operations use the user's cookie session and RLS, not this privileged client.

### Worker: `.env`

The simplified search needs only database access and the HN interval:

```dotenv
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVER_ONLY_SERVICE_ROLE_JWT
HN_REQUEST_INTERVAL=0.25
```

Optional retained analysis settings (`AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`, `AI_MAX_OUTPUT_TOKENS`, `AI_MAX_CALLS_PER_RUN`) are not needed by the category-search UI. They remain available for existing administrator-controlled analysis jobs. Search always queues collection-only jobs.

| Variable                                   | Meaning / where to get it                                                   |
| ------------------------------------------ | --------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_URL` | The same project's API URL; web and Python use different variable names     |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`            | Public anon or publishable key from Supabase API settings                   |
| `SUPABASE_SERVICE_ROLE_KEY`                | Server-only legacy service_role JWT from the project's API key settings     |
| `APP_URL`                                  | Exact app origin, without `/auth/callback`; HTTPS in production             |
| `AI_BASE_URL`                              | Trusted API base URL; the worker appends `/chat/completions`                |
| `AI_API_KEY`                               | Model-provider key; required only for AI-enabled jobs                       |
| `AI_MODEL`                                 | Exact model ID supporting strict `response_format: json_schema`             |
| `AI_MAX_OUTPUT_TOKENS`                     | Default 1,800; bounded to 3,000 by the adapter                              |
| `AI_MAX_CALLS_PER_RUN`                     | Worker call ceiling, further limited by the selected job cap; retries count |
| `HN_REQUEST_INTERVAL`                      | Seconds between HN requests; minimum 0.25                                   |

Use the actual legacy `service_role` JWT for the current raw Python adapter, which sends it as both API key and Bearer token. A database password, Google secret or public key is not a substitute. Supabase also offers newer key types; consult its [API key documentation](https://supabase.com/docs/guides/api/api-keys) when selecting keys or adapting the client.

Never prefix the privileged Supabase or AI key with `NEXT_PUBLIC_`, and never commit real credentials. `OWNER_EMAIL` and `OWNER_ID` are not used. The template's `AI_PROVIDER` is informational; the base URL and model determine requests.

The simplified category Search never calls a model. For retained administrator-controlled analysis jobs only, configure a provider and a JSON-schema-capable model using the [OpenRouter guide](https://openrouter.ai/docs/guides/features/structured-outputs). These optional settings are not part of the user flow.

## Step 6: Install the Python worker

**Windows / PowerShell**

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r worker/requirements.lock
.\.venv\Scripts\python.exe -m pip install --no-deps -e worker
.\.venv\Scripts\pain-discovery.exe --help
```

**macOS / Linux**

```bash
python3.12 -m venv .venv
.venv/bin/python -m pip install -r worker/requirements.lock
.venv/bin/python -m pip install --no-deps -e worker
.venv/bin/pain-discovery --help
```

These commands use the virtual environment directly; activation is optional.

Test official HN access without database writes or AI calls:

```powershell
.\.venv\Scripts\pain-discovery.exe dry-run
```

On macOS/Linux use `.venv/bin/pain-discovery dry-run`. This scans up to 10 HN items, in addition to fetching story lists. Its JSON reports actual scanned/eligible counts, `persisted: 0` and `ai_calls: 0`. Live counts vary.

## Step 7: Start the app and worker

After installing the Python environment, start both processes with one command from the repository root:

```powershell
npm.cmd run dev
```

On macOS/Linux use `npm run dev`. The launcher starts Next.js and `.venv`'s Python research worker. It loads `.env.local` with Next.js precedence and passes the web app's Supabase URL/key to the worker. Worker startup/processing errors appear in the same terminal. Ctrl+C stops the processes started by the launcher.

For separate terminals, use `npm run dev:web` and `npm run worker`. A bounded standalone worker command is `npm run worker -- run-once --max-jobs 1`. These commands use the same local configuration. Direct `.venv` Python CLI commands still require valid worker `.env` values.

The worker polls the database every five seconds. Restart the launcher after changing environment files. Production deployments still need a separately configured worker.

While a search is active, the browser checks a small authenticated status endpoint instead of reloading the entire page. Checks run sequentially, stop after 30 seconds of queued time or two minutes of running time, and pause on network errors. A paused search shows **Check again**; its worker job is not falsely marked failed. Reloading an old queued search does not restart the automatic timeout. Results refresh once the job reaches a terminal state.

## Step 8: Create an account

1. Open **http://localhost:3000/signup**.
2. Choose Google, or enter an email you can receive mail at, a unique username such as `researcher_01`, and your own password of at least 12 characters.
3. For password signup, confirm your email and return to `/login`.
4. Sign in with Google, email/password, or username/password when server lookup is configured.
5. You land on the category selector, ready to search.

Usernames use 3-32 letters, numbers or underscores and are stored lowercase. Duplicates are rejected. Google signup creates a profile but does not create a password; Google-only accounts should continue using Google.

For a privacy check, start a category search, then register a second confirmed account in a separate browser profile. It should have its own workspace and cannot open the first account's search by URL.

## Step 9: Choose categories and search

1. On the home screen, open **Research categories**.
2. Choose one or more categories, up to five, and press **Done**.
3. Press **Search**. The app creates your private research project and queues a bounded search automatically.
4. Stay on the results page. It refreshes automatically while the search is queued/running.
5. Read the discussion excerpts and use **Read discussion** to open the original source.
6. Change the selected categories and Search again, or use **New research** for a fresh selection.

For example, select **Cyber security** and **Startup founders**. The app supplies terms such as cybersecurity, vulnerability, founder and bootstrapping. No title or keywords are requested. Another example is **B2B & SaaS** with **Software alternatives**, which looks for matching public conversations about SaaS, procurement and replacements. These category examples are research queries, not evidence of customer demand.

There is no extra field for a named competitor: **Software alternatives** is a broad category. Its results are not restricted to one specific product.

The current official HN connector samples recent Ask HN/new discussions and bounded descendants. Matching uses curated category terms. It does not crawl linked articles or author profiles, and the official API has no keyword-search endpoint. A narrow selection can return zero results; try another mix. Excerpts are source text, not AI-validated pain or purchase predictions.

If a search remains queued, check the worker startup output in the `npm run dev` terminal. Automatic checks pause after 30 seconds instead of spinning indefinitely; use **Check again** after the worker is available. No paid AI key or model configuration is needed to get results. The user never needs to set a run cap or choose a connector; those defaults are controlled by the application.

## Sources, evidence and retention

| Source                                    | Default state                                    | Access                                                                       |
| ----------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------- |
| Hacker News                               | Enabled                                          | Official Firebase API; no article/profile crawl                              |
| Manual import                             | Retained backend only; no import form            | Existing permitted excerpts remain subject to retention                      |
| Approved public pages                     | Disabled until configured                        | Exact administrator-approved HTTPS pages with permission and robots checks   |
| G2, Capterra, Reddit                      | Disabled; dedicated integrations not implemented | Applicable authorization/licensing required before activation                |
| LinkedIn and other restricted communities | Automated access disabled                        | Only permitted manually supplied professional context/excerpts as applicable |

Policies are global administrator configuration managed through Supabase; the simple UI has no source-settings screen. Users cannot enable connectors or change access/retention settings. Private-community harvesting, personal contact collection, sensitive-attribute inference and CAPTCHA/authentication/paywall bypasses are outside the app.

Quotes must be exact substrings of stored normalized text. The worker redacts email/phone-like strings; manual imports reject contact-like strings. The retained optional analysis backend restricts factual extraction fields to phrases in supporting quotes. The category UI displays original excerpts and does not invoke that analysis. Source text is untrusted data and cannot select tools or change permissions.

The retained optional analysis backend matches exact normalized problem phrases; paraphrases can remain separate. Lists are bounded, not full exports. Successful analyses are not automatically repeated after a model/prompt change; reanalysis needs an explicit administrative workflow. Source IDs, URLs and normalized hashes deduplicate within a user's source, and project/item constraints prevent repeated signals.

HN and manual excerpts default to 30-day retention; approved public pages default to 7 days. Policies may require less. Expired sources and dependent findings/prospects/drafts are hidden by RLS. Purge physically removes expired sources and cascades dependent records. Removal records an identifier/hash tombstone to prevent reimport. Deleting a project does not automatically remove sources shared with that user's other projects.

### Optional: configure approved public pages

Keep this disabled until the domain's terms or written permission cover collection, excerpt storage and AI analysis. No domain is approved by this repository.

1. Review the specific domain's permission and robots policy as administrator.
2. Use [public_web.pages.example.json](worker/manifests/public_web.pages.example.json) as the shape for `source_policies.limits` on `public_web`.
3. Replace sample URLs, set a real UTC `reviewed_at` within 30 days, and set both permission confirmations true only after review. Configure `max_items` and suitable retention.
4. Through administrator SQL, set `enabled=true`, `automated_fetch=true`, `approval_status='approved'`, `last_verified_at`, and clear the disabled reason.
5. Public-page ingestion is retained backend functionality and is not selectable in the simple category UI. Renew the permission review before it expires. New category searches use HN only.

The connector checks robots.txt, waits at least two seconds and honors longer supported delays, pins validated public DNS addresses with TLS verification, rejects redirects/queries/IP-literal targets, and caps decoded responses at 1 MB and excerpts at 12,000 characters. It stops on unavailable/disallowed robots rules, access challenges and HTTP 401/403/429. G2, Capterra, Reddit, LinkedIn, Discord and Slack are excluded from this general connector. It neither follows links nor establishes authorship. Page-wide text can include navigation and needs review. See the [connector manifest](worker/manifests/public_web.json).

## Worker commands and cost controls

Run from the repository root using the virtual environment CLI. Prefix the command name below with `.\.venv\Scripts\` on Windows or `.venv/bin/` on macOS/Linux.

| Command                                 | Purpose                                                           |
| --------------------------------------- | ----------------------------------------------------------------- |
| `pain-discovery dry-run`                | Official HN sample; no database writes or AI                      |
| `pain-discovery run-once --max-jobs 1`  | Process at most one queued job                                    |
| `pain-discovery watch`                  | Poll for jobs every five seconds                                  |
| `pain-discovery scheduled --max-jobs 5` | Purge, enqueue opted-in scheduled research, drain up to five jobs |
| `pain-discovery purge`                  | Physically remove expired sources and dependent records           |

One worker serves all confirmed accounts. Claims are atomic, and each project allows only one active job. A running lease older than 20 minutes fails visibly on the next claim; paid calls are not automatically repeated. Failed/partial CLI runs exit nonzero and record operational errors without raw source/model content or secrets.

Each user can enqueue up to 10 jobs/hour. The retained backend also enforces its legacy draft cap. Category searches cap fetched items at 60 and disable AI. Legacy analysis jobs retain their separate call limits. Each extraction has at most two attempts; every attempt consumes the cap. Token usage is recorded when provided, not converted into invented dollar costs. Provider spending limits are shared deployment controls. Zero findings can still involve API usage.

Run purge daily even if scheduling is off. Review source denials and Retry-After instructions before a later run; there is no bypass or rotating-proxy fallback.

## Deploy the MVP

### Web on Vercel

1. Import the repository as a Next.js project using the repository root.
2. Add the four web values from the `.env.local` example to the appropriate Vercel environments. Set `APP_URL` to the deployed HTTPS origin. The service-role value remains server-only.
3. Build with `npm run build` and deploy.
4. Update Supabase's Site URL/app callbacks and Google's origin/audience configuration for the deployment.
5. Verify signup, confirmation, login and two-account isolation against the deployed app.
6. Run a separate worker or configure GitHub Actions; Vercel does not execute the Python CLI for queued jobs.

AI credentials belong in the worker environment, not the browser or Vercel web UI configuration. No resources, accounts or deployment secrets are provisioned automatically.

### Optional GitHub Actions worker

The [discovery workflow](.github/workflows/discovery.yml) is inactive until configured:

| GitHub setting      | Name                         | Value                                            |
| ------------------- | ---------------------------- | ------------------------------------------------ |
| Repository variable | `DISCOVERY_SCHEDULE_ENABLED` | `true`                                           |
| Secret              | `SUPABASE_URL`               | Supabase API URL                                 |
| Secret              | `SUPABASE_SERVICE_ROLE_KEY`  | Server-only service-role JWT                     |
| Secret              | `AI_API_KEY`                 | Needed to process AI-enabled queued jobs         |
| Variable            | `AI_MODEL`                   | JSON-schema-compatible model ID for AI jobs      |
| Variable            | `AI_BASE_URL`                | Optional; default `https://openrouter.ai/api/v1` |

New category searches are not opted into recurring collection. The optional workflow drains queued jobs; recurring jobs for retained projects remain administrator-controlled. It runs at **06:17 UTC / 09:17 Africa/Nairobi**, subject to GitHub scheduling delays. It purges expired content, enqueues collection-only scheduled jobs, and can process user-queued AI-enabled jobs. Workflow dispatch uses the same enable variable. Runs have a 15-minute timeout, a shared concurrency group and a five-job drain limit. Daily scheduling can leave new searches queued until the next run; keep a separate `pain-discovery watch` worker running for prompt results.

## Verification commands

**Web and database**

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

**Python**

```powershell
.\.venv\Scripts\python.exe -m pytest worker/tests -q
```

On macOS/Linux use `npm` and `.venv/bin/python`. Unit/mocked pipeline tests and embedded PostgreSQL migration/RLS tests need no external credentials or Docker. They apply the three migrations in order; they do not verify your hosted project's configuration.

**Browser**

The default browser checks use an anonymous browser session to verify login/signup and protected-route redirects. They work with either configured or unconfigured web settings:

```powershell
npm.cmd run build
npx.cmd playwright install chromium
npm.cmd run test:e2e
```

For installed Edge, set `$env:PLAYWRIGHT_CHANNEL='msedge'` before `npm.cmd run test:e2e`. Tests reuse an existing server on port 3000 when available.

For optional **live** acceptance, configure Supabase, keep the worker running, set `LIVE_E2E=true`, `E2E_USER_EMAIL` and `E2E_USER_PASSWORD` for a confirmed password account, then run `npm run test:e2e`. The test signs in, chooses B2B & SaaS and Startup founders, starts a real collection-only search and waits for its completion. No AI or invented excerpt is needed; zero matches is valid for the real HN sample.

For isolated end-to-end UI checks without real credentials or network sources, run:

```powershell
npm.cmd run test:research-browser
```

This test uses an explicitly labeled fixture Auth/database server and a separate ignored app copy under `test-results/`; it never writes to your Supabase project. It checks category selection, private project creation, queue settings, automatic refresh, safe excerpt rendering and mobile/desktop layouts. It uses installed Edge on Windows or bundled Playwright Chromium elsewhere, overridable through `PLAYWRIGHT_CHANNEL`. These fixtures do not establish that your live worker or database is configured correctly.

## Troubleshooting

| Symptom                                                   | Check                                                                                                                                             |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Login shows Configuration required                        | Set public Supabase URL/key in `.env.local`; restart Next.js                                                                                      |
| Account setup/database permission error                   | Run all three complete migrations in order and confirm the user's email                                                                           |
| Confirmation mail missing or email address not authorized | Verify custom SMTP, sender verification, provider logs and spam folder; Supabase default delivery is restricted                                   |
| Google redirect URI mismatch                              | Google's callback is Supabase's `/auth/v1/callback`; Supabase's allowed redirect is the app's `/auth/callback`                                    |
| Google works only for certain users                       | Check Google's application testing/audience settings                                                                                              |
| Callback returns to login                                 | Check `APP_URL`, exact allowed callbacks, email confirmation and the browser that began signup                                                    |
| Email login works but username does not                   | Set the server lookup key and use the username chosen at signup; Google-only accounts have no password                                            |
| Signup cannot be completed                                | Try another username; check signup/provider settings, SMTP and Auth rate limits; existing accounts can sign in                                    |
| Job stays queued                                          | Restart with `npm run dev`, which starts the worker too; check its startup errors and valid Supabase server key. Use Check again after it starts. |
| Completed run has no findings                             | Check matching categories; HN is a bounded recent sample, not exhaustive search                                                                   |
| Another run cannot start                                  | A job is queued/running; a stale running lease is failed on the next worker claim                                                                 |
| Source disappears                                         | Check retention/expiry or removal; purge handles physical cleanup                                                                                 |
| Worker key/connection error                               | Use the same project as the web and its actual service-role JWT, not a database password or public key                                            |
| PowerShell refuses npm.ps1                                | Use `npm.cmd` and `npx.cmd`                                                                                                                       |
| Python packages seem missing                              | Run pip/pytest through the virtual environment's Python                                                                                           |

## Optional local Supabase

The main steps use hosted Supabase. To run Supabase locally, install its CLI and Docker, start Docker, then use:

```bash
supabase start
supabase db reset
```

`db reset` recreates the local database and applies the same migrations. Use the API URL/keys reported by the local CLI in your env files. Local Auth confirmation messages can be inspected in the mail-capture service shown by the CLI. Google sign-in still needs its own provider configuration; the minimal checked-in config does not configure Google credentials.

## Repository map and references

```text
app/                    Auth pages, protected routes and server actions
components/             Shared UI, forms and draft review
lib/                    Validation, auth, Supabase clients and outreach templates
supabase/migrations/    Three ordered fresh-install SQL files
worker/pain_discovery/  Connectors, validation, scoring, storage and CLI
worker/manifests/       Source-access descriptions and public-page example
worker/tests/           Python unit and mocked integration tests
tests/                  TypeScript, schema, migration and RLS tests
e2e/                    Browser and optional live acceptance tests
.github/workflows/      CI checks and optional scheduled worker
```

- [Database setup](supabase/README.md), [environment template](.env.example), [implementation plan](IMPLEMENTATION_PLAN.md) and [implementation status](IMPLEMENTATION_STATUS.md).
- [Official HN API](https://github.com/HackerNews/API), [Supabase Auth](https://supabase.com/docs/guides/auth), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) and [OpenRouter structured outputs](https://openrouter.ai/docs/guides/features/structured-outputs).

The MVP has bounded sampling, extractive summaries and exact-phrase clustering. It does not include exhaustive historical search, automatic reanalysis, semantic clustering, billing, teams, unrestricted crawling or sending messages. Verify live services in your configured deployment; examples and passing local tests are not real customer findings.
