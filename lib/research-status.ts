import { z } from "zod";

export const researchStatusSchema = z.object({
  id: z.uuid(),
  state: z.enum(["queued", "running", "completed", "partial", "failed"]),
  created_at: z.iso.datetime({ offset: true }),
  started_at: z.iso.datetime({ offset: true }).nullable(),
});
export type ResearchStatus = z.infer<typeof researchStatusSchema>;
export type PollPause = "queued" | "running" | "connection";
export const QUEUED_WAIT_MS = 30_000;
export const RUNNING_WAIT_MS = 120_000;
const POLL_INTERVAL_MS = 5_000;
const REQUEST_TIMEOUT_MS = 10_000;

/** Sequential, abortable polling with both job-age and session limits. */
export function createResearchPoller(options: {
  initial: ResearchStatus;
  request: (signal: AbortSignal) => Promise<ResearchStatus>;
  onStatus: (status: ResearchStatus) => void;
  onPause: (reason: PollPause) => void;
  onComplete: () => void;
  onChecking?: (checking: boolean) => void;
  onResume?: () => void;
  isVisible?: () => boolean;
  now?: () => number;
}) {
  const now = options.now ?? Date.now;
  const openedAt = now();
  let status = options.initial;
  let stopped = false;
  let busy = false;
  let checks = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;

  function remaining() {
    const running = status.state === "running";
    const timestamp = running
      ? (status.started_at ?? status.created_at)
      : status.created_at;
    const parsed = Date.parse(timestamp);
    const age = now() - (Number.isFinite(parsed) ? parsed : openedAt);
    return Math.min(
      (running ? RUNNING_WAIT_MS : QUEUED_WAIT_MS) - age,
      RUNNING_WAIT_MS - (now() - openedAt),
    );
  }
  function schedule() {
    if (stopped) return;
    if (remaining() <= 0 || checks >= 24) {
      options.onPause(status.state === "queued" ? "queued" : "running");
      return;
    }
    options.onResume?.();
    timer = setTimeout(
      () => void check(),
      Math.min(POLL_INTERVAL_MS, remaining()),
    );
  }
  async function check(manual = false) {
    if (stopped || busy) return;
    clearTimeout(timer);
    if (!manual && (remaining() <= 0 || checks >= 24)) {
      options.onPause(status.state === "queued" ? "queued" : "running");
      return;
    }
    if (!manual && options.isVisible && !options.isVisible()) {
      schedule();
      return;
    }
    busy = true;
    options.onChecking?.(true);
    controller = new AbortController();
    const activeController = controller;
    timeout = setTimeout(() => activeController.abort(), REQUEST_TIMEOUT_MS);
    try {
      checks++;
      status = await options.request(activeController.signal);
      if (stopped) return;
      options.onStatus(status);
      if (status.state !== "queued" && status.state !== "running") {
        stopped = true;
        options.onComplete();
      } else schedule();
    } catch {
      if (!stopped) options.onPause("connection");
    } finally {
      clearTimeout(timeout);
      controller = undefined;
      busy = false;
      if (!stopped) options.onChecking?.(false);
    }
  }
  return {
    start: schedule,
    check: () => check(true),
    stop() {
      stopped = true;
      clearTimeout(timer);
      clearTimeout(timeout);
      controller?.abort();
    },
  };
}
