import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  createResearchPoller,
  type ResearchStatus,
} from "../lib/research-status";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-27T10:00:00Z"));
});
afterEach(() => vi.useRealTimers());
const status = (state: ResearchStatus["state"] = "queued"): ResearchStatus => ({
  id: "00000000-0000-4000-8000-000000000001",
  state,
  created_at: new Date().toISOString(),
  started_at: state === "running" ? new Date().toISOString() : null,
});
function setup(initial = status()) {
  const request = vi.fn(async () => initial);
  const onPause = vi.fn(),
    onComplete = vi.fn(),
    onStatus = vi.fn();
  const poller = createResearchPoller({
    initial,
    request,
    onPause,
    onComplete,
    onStatus,
  });
  return { poller, request, onPause, onComplete, onStatus };
}

it("stops automatic checks after 30 seconds for an unclaimed job", async () => {
  const { poller, request, onPause } = setup();
  poller.start();
  await vi.advanceTimersByTimeAsync(31_000);
  expect(onPause).toHaveBeenLastCalledWith("queued");
  const count = request.mock.calls.length;
  await vi.advanceTimersByTimeAsync(300_000);
  expect(request).toHaveBeenCalledTimes(count);
  expect(vi.getTimerCount()).toBe(0);
});
it("does not restart a stale queue's timer on navigation and manual checks stay bounded", async () => {
  const { poller, request, onPause } = setup({
    ...status(),
    created_at: "2026-10-27T09:00:00Z",
  });
  poller.start();
  expect(onPause).toHaveBeenCalledWith("queued");
  await vi.advanceTimersByTimeAsync(60_000);
  expect(request).not.toHaveBeenCalled();
  await poller.check();
  expect(request).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(request).toHaveBeenCalledTimes(1);
});
it("stops checking a running job after two minutes without falsely failing the job", async () => {
  const { poller, request, onPause, onComplete } = setup(status("running"));
  poller.start();
  await vi.advanceTimersByTimeAsync(130_000);
  expect(onPause).toHaveBeenLastCalledWith("running");
  expect(onComplete).not.toHaveBeenCalled();
  const count = request.mock.calls.length;
  await vi.advanceTimersByTimeAsync(300_000);
  expect(request).toHaveBeenCalledTimes(count);
});
it.each(["completed", "partial", "failed"] as const)(
  "refreshes results exactly once on %s",
  async (terminal) => {
    const { poller, request, onComplete } = setup();
    request.mockResolvedValue(status(terminal));
    poller.start();
    await vi.advanceTimersByTimeAsync(100_000);
    expect(request).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledTimes(1);
  },
);
it("aborts a hung status request and never overlaps requests", async () => {
  const onPause = vi.fn(),
    request = vi.fn(
      (signal: AbortSignal) =>
        new Promise<ResearchStatus>((_resolve, reject) =>
          signal.addEventListener("abort", () => reject(new Error("timeout"))),
        ),
    );
  const poller = createResearchPoller({
    initial: status(),
    request,
    onPause,
    onStatus: vi.fn(),
    onComplete: vi.fn(),
  });
  poller.start();
  await vi.advanceTimersByTimeAsync(12_000);
  expect(request).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(5_000);
  expect(onPause).toHaveBeenCalledWith("connection");
  await vi.advanceTimersByTimeAsync(60_000);
  expect(request).toHaveBeenCalledTimes(1);
});
it("cancels pending work on unmount", async () => {
  const { poller, request } = setup();
  poller.start();
  poller.stop();
  await vi.advanceTimersByTimeAsync(60_000);
  expect(request).not.toHaveBeenCalled();
});
