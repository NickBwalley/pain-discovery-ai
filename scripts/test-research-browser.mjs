// Isolated browser integration test. All Auth/source records below are test fixtures.
// No real Supabase credentials, source fetches, AI calls or production writes occur.
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { cp, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { createServerClient } from "@supabase/ssr";

const user = {
  id: "00000000-0000-4000-8000-000000000001",
  aud: "authenticated",
  role: "authenticated",
  email: "fixture@example.test",
  email_confirmed_at: "2026-01-01T00:00:00Z",
  app_metadata: {},
  user_metadata: {},
  identities: [],
  created_at: "2026-01-01T00:00:00Z",
};
const token = `${Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ sub: user.id, aud: "authenticated", role: "authenticated", email: user.email, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.fixture`;
const projects = new Map();
const jobs = new Map();
const requests = [];
const backend = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = chunks.length
    ? JSON.parse(Buffer.concat(chunks).toString())
    : null;
  res.setHeader("Content-Type", "application/json");
  const reply = (value) => res.end(JSON.stringify(value));
  if (url.pathname === "/auth/v1/token")
    return reply({
      access_token: token,
      refresh_token: "fixture-refresh",
      expires_in: 3600,
      token_type: "bearer",
      user,
    });
  if (url.pathname === "/auth/v1/user") return reply(user);
  if (url.pathname.endsWith("/rpc/ensure_user_profile")) return reply(true);
  if (url.pathname.endsWith("/research_projects")) {
    if (req.method === "POST") {
      const id = randomUUID();
      const project = { ...body, id, created_at: new Date().toISOString() };
      projects.set(id, project);
      requests.push(project);
      return reply({ id });
    }
    const id = url.searchParams.get("id")?.replace("eq.", "");
    return reply(projects.get(id) ?? null);
  }
  if (url.pathname.endsWith("/rpc/enqueue_discovery")) {
    assert.equal(body.p_ai, false);
    assert.equal(body.p_cap, 60);
    jobs.set(body.p_project, {
      id: randomUUID(),
      created_at: new Date().toISOString(),
      observed: false,
      complete: false,
    });
    return reply(randomUUID());
  }
  const id = url.searchParams.get("project_id")?.replace("eq.", "");
  const started = jobs.get(id);
  const complete = started?.complete;
  if (url.pathname.endsWith("/discovery_runs")) {
    if (started && !started.observed) {
      started.observed = true;
      setTimeout(() => {
        started.complete = true;
      }, 500);
    }
    return reply(
      started
        ? [
            {
              id: started.id,
              state: complete ? "completed" : "queued",
              created_at: started.created_at,
              started_at: null,
              errors: 0,
            },
          ]
        : [],
    );
  }
  if (url.pathname.endsWith("/project_source_items"))
    return reply(
      complete
        ? [
            {
              source_items: {
                id: "fixture-source",
                source: "hacker_news",
                title: "[Browser test fixture] Discussing a developer workflow",
                author_handle: "test_fixture",
                canonical_url: "https://news.ycombinator.com/item?id=1",
                published_at: "2026-01-01T12:00:00Z",
                collected_at: new Date().toISOString(),
                expires_at: new Date(Date.now() + 86400000).toISOString(),
                permitted_excerpt:
                  "[Browser test fixture, not a real source statement] We are discussing the manual steps in a startup workflow. <script>unsafe()</script>",
              },
            },
          ]
        : [],
    );
  res.statusCode = 404;
  reply({ message: "Unexpected test endpoint" });
});
await new Promise((resolve) => backend.listen(0, "127.0.0.1", resolve));
const supabaseUrl = `http://127.0.0.1:${backend.address().port}`;
process.env.NEXT_PUBLIC_SUPABASE_URL = supabaseUrl;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "fixture-public-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fixture-server-key";
process.env.APP_URL = "http://127.0.0.1:3102";
const cookies = [];
const client = createServerClient(supabaseUrl, "fixture-public-key", {
  cookies: { getAll: () => [], setAll: (values) => cookies.push(...values) },
});
await client.auth.signInWithPassword({
  email: user.email,
  password: "fixture-only-password",
});
const { default: next } = await import("next");
// A separate test-only copy avoids locking/restarting an existing developer server.
const preview = resolve("test-results/research-app");
await mkdir(preview, { recursive: true });
for (const name of [
  "app",
  "components",
  "lib",
  "package.json",
  "tsconfig.json",
  "next-env.d.ts",
  "next.config.ts",
  "postcss.config.mjs",
])
  await cp(resolve(name), resolve(preview, name), { recursive: true });
const app = next({
  dev: true,
  dir: preview,
  hostname: "127.0.0.1",
  port: 3102,
  turbopack: true,
});
await app.prepare();
const server = createServer(app.getRequestHandler());
server.on("upgrade", app.getUpgradeHandler());
await new Promise((resolve) => server.listen(3102, "127.0.0.1", resolve));
const browser = await chromium.launch({
  channel:
    process.env.PLAYWRIGHT_CHANNEL ||
    (process.platform === "win32" ? "msedge" : undefined),
  headless: true,
});
let testError;
try {
  await mkdir("test-results", { recursive: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  await context.addCookies(
    cookies.map((cookie) => ({
      name: cookie.name,
      value: cookie.value,
      url: "http://127.0.0.1:3102",
    })),
  );
  const page = await context.newPage();
  const browserRequests = [];
  page.on("request", (request) => browserRequests.push(new URL(request.url())));
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("http://127.0.0.1:3102");
  await page.getByRole("heading", { name: /Good ideas start/ }).waitFor();
  assert.equal(await page.locator("aside").count(), 0);
  assert.equal(
    await page.getByLabel("Project title", { exact: true }).count(),
    0,
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Search", exact: true })
      .isDisabled(),
    true,
  );
  await page.screenshot({
    path: "test-results/simple-research-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: /Research categories/ }).click();
  await page
    .getByRole("checkbox", { name: "Cyber security", exact: true })
    .check();
  await page
    .getByRole("checkbox", { name: "Startup founders", exact: true })
    .check();
  await page.screenshot({
    path: "test-results/simple-research-categories.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.waitForURL(/\/projects\//);
  await page
    .getByRole("heading", { name: "1 conversation to explore" })
    .waitFor({ timeout: 30000 });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].owner_id, user.id);
  assert.equal(requests[0].title, "Cyber security + Startup founders");
  assert.ok(
    browserRequests.some(
      (url) =>
        url.pathname.startsWith("/api/research/") &&
        url.pathname.endsWith("/status"),
    ),
  );
  assert.ok(
    browserRequests.filter((url) => url.pathname.startsWith("/projects/"))
      .length <= 2,
  );
  await page.getByText("<script>unsafe()</script>", { exact: false }).waitFor();
  await page.screenshot({
    path: "test-results/simple-research-results.png",
    fullPage: true,
  });
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "dark";
  });
  await page.screenshot({
    path: "test-results/simple-research-dark.png",
    fullPage: true,
  });
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "light";
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/simple-research-mobile-results.png",
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.getByRole("link", { name: "New research", exact: true }).click();
  await page.getByRole("heading", { name: /Good ideas start/ }).waitFor();
  await page.getByRole("button", { name: /Research categories/ }).click();
  await page.screenshot({
    path: "test-results/simple-research-mobile.png",
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  const popup = await page.locator(".category-popover").boundingBox();
  assert.ok(popup.y >= 0 && popup.y + popup.height <= 844);
  await page.keyboard.press("Escape");
  assert.equal(await page.locator(".category-popover").count(), 0);
  // A missing worker must not create an endless refresh loop or fake a failure.
  const stalled = randomUUID();
  projects.set(stalled, { ...requests[0], id: stalled });
  jobs.set(stalled, {
    id: randomUUID(),
    created_at: new Date(Date.now() - 300_000).toISOString(),
    observed: true,
    complete: false,
  });
  await page.goto(`http://127.0.0.1:3102/projects/${stalled}`);
  await page
    .getByRole("heading", { name: "This search hasn't started yet." })
    .waitFor();
  const stalledRequests = () =>
    browserRequests.filter(
      (url) =>
        url.pathname === `/projects/${stalled}` ||
        url.pathname === `/api/research/${stalled}/status`,
    ).length;
  const requestCount = stalledRequests();
  await page.waitForTimeout(5500);
  assert.equal(stalledRequests(), requestCount);
  assert.equal(await page.locator(".research-progress .spin").count(), 0);
  await page.getByRole("button", { name: "Check again", exact: true }).click();
  await page
    .getByRole("button", { name: "Check again", exact: true })
    .waitFor();
  const checks = browserRequests.filter(
    (url) => url.pathname === `/api/research/${stalled}/status`,
  ).length;
  assert.equal(checks, 1);
  await page.waitForTimeout(1000);
  assert.equal(
    browserRequests.filter(
      (url) => url.pathname === `/api/research/${stalled}/status`,
    ).length,
    checks,
  );
  await page.screenshot({
    path: "test-results/research-queued-paused.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    "PASS: category search, private status polling, one completion refresh, stale-queue pause/manual check, safe results and viewport fit.",
  );
} catch (error) {
  testError = error;
  console.error(error);
} finally {
  await browser.close();
  await client.auth.signOut({ scope: "local" });
  server.closeAllConnections();
  server.close();
  backend.closeAllConnections();
  backend.close();
  await Promise.race([
    app.close(),
    new Promise((resolve) => setTimeout(resolve, 1500)),
  ]);
}
// Next's development bundler may retain background handles after server shutdown.
process.exit(testError ? 1 : 0);
