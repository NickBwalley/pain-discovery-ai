import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  configured: vi.fn(),
  getUser: vi.fn(),
  from: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  configured: mocks.configured,
  supabase: async () => ({
    auth: { getUser: mocks.getUser },
    from: mocks.from,
  }),
}));
import { GET } from "../app/api/research/[id]/status/route";
const project = "10000000-0000-4000-8000-000000000001";
const run = {
  id: "20000000-0000-4000-8000-000000000001",
  state: "queued",
  created_at: "2026-10-27T10:00:00+00:00",
  started_at: null,
};
const call = () =>
  GET(new Request(`http://localhost/api/research/${project}/status`), {
    params: Promise.resolve({ id: project }),
  });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.configured.mockReturnValue(true);
  mocks.getUser.mockResolvedValue({
    data: { user: { id: "session-user", email_confirmed_at: "2026-01-01" } },
    error: null,
  });
  const chain = {
    eq: mocks.eq,
    order: () => chain,
    limit: () => chain,
    maybeSingle: mocks.maybeSingle,
  };
  mocks.eq.mockReturnValue(chain);
  mocks.from.mockReturnValue({ select: () => chain });
  mocks.maybeSingle.mockResolvedValue({ data: run, error: null });
});
it("returns an uncached status scoped to the authenticated user", async () => {
  const response = await call();
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(run);
  expect(mocks.eq).toHaveBeenCalledWith("project_id", project);
  expect(mocks.eq).toHaveBeenCalledWith("owner_id", "session-user");
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
});
it("rejects an anonymous status request without querying research", async () => {
  mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
  expect((await call()).status).toBe(401);
  expect(mocks.from).not.toHaveBeenCalled();
});
it("does not expose another user's missing/inaccessible run", async () => {
  mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
  expect((await call()).status).toBe(404);
});
it("returns a retryable error instead of raw database details", async () => {
  mocks.maybeSingle.mockResolvedValue({
    data: null,
    error: { message: "private details" },
  });
  const response = await call();
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("private details");
});
