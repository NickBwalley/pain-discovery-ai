"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock3, LoaderCircle, RefreshCw } from "lucide-react";
import {
  createResearchPoller,
  researchStatusSchema,
  type PollPause,
  type ResearchStatus,
} from "@/lib/research-status";

export function ResearchProgress({
  projectId,
  initial,
}: {
  projectId: string;
  initial: ResearchStatus;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(initial);
  const [paused, setPaused] = useState<PollPause | null>(null);
  const [checking, setChecking] = useState(false);
  const poller = useRef<ReturnType<typeof createResearchPoller> | null>(null);
  useEffect(() => {
    const active = createResearchPoller({
      initial,
      async request(signal) {
        const response = await fetch(`/api/research/${projectId}/status`, {
          cache: "no-store",
          signal,
        });
        if (!response.ok) throw new Error("Status unavailable");
        return researchStatusSchema.parse(await response.json());
      },
      onStatus: setStatus,
      onPause: setPaused,
      onChecking: setChecking,
      onResume: () => setPaused(null),
      onComplete: () => router.refresh(),
      isVisible: () => !document.hidden,
    });
    poller.current = active;
    active.start();
    return () => {
      active.stop();
      poller.current = null;
    };
  }, [initial, projectId, router]);
  return (
    <div className="research-progress" role="status">
      <span className="research-progress-icon">
        {paused ? (
          <Clock3 size={23} />
        ) : (
          <LoaderCircle size={23} className="spin" />
        )}
      </span>
      <div>
        <h2>
          {paused === "queued"
            ? "This search hasn't started yet."
            : paused === "running"
              ? "This search is taking longer than expected."
              : paused === "connection"
                ? "We couldn't check this search."
                : status.state === "queued"
                  ? "Your search is in line."
                  : "Finding relevant conversations…"}
        </h2>
        <p>
          {paused === "queued"
            ? "It's still queued. Automatic checks have paused while it waits for the research service."
            : paused === "running"
              ? "It may still be processing. Automatic checks have paused; you can check again when you're ready."
              : paused === "connection"
                ? "Check your connection, then try again."
                : status.state === "queued"
                  ? "Waiting for the research service to start. We'll check briefly for an update."
                  : "We're checking recent public discussions. Results appear when the search finishes."}
        </p>
        {paused && (
          <button
            type="button"
            className="research-check"
            disabled={checking}
            onClick={() => void poller.current?.check()}
          >
            <RefreshCw size={14} className={checking ? "spin" : ""} />
            {checking ? "Checking…" : "Check again"}
          </button>
        )}
      </div>
    </div>
  );
}
