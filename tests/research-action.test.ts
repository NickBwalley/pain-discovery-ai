import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  insert: vi.fn(),
  single: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { searchResearch } from "../app/research-actions";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.from.mockReturnValue({ insert: mocks.insert });
  mocks.insert.mockReturnValue({ select: () => ({ single: mocks.single }) });
  mocks.single.mockResolvedValue({ data: { id: "project" }, error: null });
  mocks.rpc.mockResolvedValue({ data: "run", error: null });
  mocks.requireUser.mockResolvedValue({
    user: { id: "signed-in-user" },
    db: { from: mocks.from, rpc: mocks.rpc },
  });
});
it("creates and queues a bounded source search for the session user with no paid AI", async () => {
  const form = new FormData();
  form.append("categories", "b2b");
  form.set("owner_id", "another-user");
  form.set("enabled_sources", "reddit");
  await expect(searchResearch(null, form)).rejects.toThrow(
    "redirect:/projects/project",
  );
  expect(mocks.insert).toHaveBeenCalledWith(
    expect.objectContaining({
      owner_id: "signed-in-user",
      title: "B2B & SaaS",
      enabled_sources: ["hacker_news"],
    }),
  );
  expect(mocks.rpc).toHaveBeenCalledWith("enqueue_discovery", {
    p_project: "project",
    p_ai: false,
    p_cap: 60,
    p_calls: 1,
  });
});
it("does not create a project or queue a job for invalid categories", async () => {
  expect(await searchResearch(null, new FormData())).toEqual({
    error: "Choose at least one category.",
  });
  expect(mocks.insert).not.toHaveBeenCalled();
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("reports creation errors and never pretends to have queued a failed search", async () => {
  const form = new FormData();
  form.append("categories", "founders");
  mocks.single.mockResolvedValue({ data: null, error: { message: "offline" } });
  expect(await searchResearch(null, form)).toEqual({
    error: "We couldn't create your research. Please try again.",
  });
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("shows a queue failure notice on the saved research instead of a false running state", async () => {
  const form = new FormData();
  form.append("categories", "b2b");
  mocks.rpc.mockResolvedValue({
    data: null,
    error: { message: "Hourly job cap reached" },
  });
  await expect(searchResearch(null, form)).rejects.toThrow(
    "could%20not%20start",
  );
});
