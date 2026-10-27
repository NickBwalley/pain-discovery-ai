import { requireUser } from "@/lib/auth";
import { check, single } from "@/lib/data";
import { idSchema } from "@/lib/validation";
import { projectCategories } from "@/lib/research";
import type { Project, Run, Source } from "@/lib/types";
import { ResearchForm } from "@/components/research-form";
import { ResearchProgress } from "@/components/research-progress";
import { ResearchResults } from "@/components/research-results";
import { SearchX } from "lucide-react";

export default async function Research({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const { id } = await params;
  idSchema.parse(id);
  const { db } = await requireUser();
  const project = await single<Project>(db, "research_projects", id);
  const [runs, links, query] = await Promise.all([
    db
      .from("discovery_runs")
      .select("*")
      .eq("project_id", id)
      .order("created_at", { ascending: false })
      .limit(1),
    db
      .from("project_source_items")
      .select("source_items!inner(*)")
      .eq("project_id", id)
      .limit(60),
    searchParams,
  ]);
  check(runs.error);
  check(links.error);
  const run = runs.data?.[0] as Run | undefined;
  const active = run?.state === "queued" || run?.state === "running";
  const sources = (
    (links.data ?? []) as unknown as { source_items: Source | null }[]
  )
    .flatMap((row) => (row.source_items ? [row.source_items] : []))
    .sort(
      (a, b) =>
        new Date(b.published_at ?? b.collected_at).getTime() -
        new Date(a.published_at ?? a.collected_at).getTime(),
    );
  return (
    <section className="research-page">
      <header className="research-page-heading">
        <p className="research-eyebrow">FOLLOW YOUR CURIOSITY</p>
        <h1>Your research.</h1>
        <p>A closer look at the conversations behind your categories.</p>
      </header>
      <div className="research-search-panel research-search-compact">
        <ResearchForm key={id} initial={projectCategories(project.keywords)} />
      </div>
      {query.notice && (
        <p className="research-error" role="alert">
          {query.notice}
        </p>
      )}
      {active && <ResearchProgress key={run.id} projectId={id} initial={{ id: run.id, state: run.state as "queued" | "running", created_at: run.created_at, started_at: run.started_at }} />}
      {!active && (run?.state === "failed" || run?.state === "partial") && (
        <div className="research-error" role="alert">
          {run.state === "partial"
            ? "Some discussions were found, but this search couldn't finish."
            : "This search couldn't finish."}{" "}
          Please try searching again.
        </div>
      )}
      {sources.length > 0 && (
        <>
          <div className="research-results-heading">
            <h2>
              {sources.length}{" "}
              {sources.length === 1 ? "conversation" : "conversations"} to
              explore
            </h2>
            <span>Matching public discussions</span>
          </div>
          <ResearchResults sources={sources} />
        </>
      )}
      {!sources.length && !active && (
        <div className="research-empty">
          <SearchX size={30} strokeWidth={1.3} />
          <h2>
            {run?.state === "failed"
              ? "Let's try another search."
              : "No matching conversations yet."}
          </h2>
          <p>
            Try a different mix of categories. Each search looks at a recent
            sample of Hacker News discussions.
          </p>
        </div>
      )}
      <p className="research-source-note">
        A recent sample of public Hacker News discussions. Open a source for the
        full context.
      </p>
    </section>
  );
}
