import { ArrowUpRight, MessageCircle } from "lucide-react";
import type { Source } from "@/lib/types";
import { publicUrl } from "@/lib/validation";

export function ResearchResults({ sources }: { sources: Source[] }) {
  return (
    <div className="research-results">
      {sources.map((source) => {
        const url = publicUrl.safeParse(source.canonical_url);
        return (
          <article key={source.id} className="research-result">
            <div className="research-result-meta">
              <span>
                <MessageCircle size={13} />
                {source.source === "hacker_news"
                  ? "Hacker News"
                  : "Public discussion"}
              </span>
              {source.published_at && (
                <time dateTime={source.published_at}>
                  {new Date(source.published_at).toLocaleDateString("en", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    timeZone: "UTC",
                  })}
                </time>
              )}
            </div>
            <h3>{source.title}</h3>
            <blockquote>
              {source.permitted_excerpt.length > 650
                ? `${source.permitted_excerpt.slice(0, 650)}…`
                : source.permitted_excerpt}
            </blockquote>
            <div className="research-result-footer">
              <span>
                {source.author_handle
                  ? `@${source.author_handle}`
                  : "Author not listed"}
              </span>
              {url.success && (
                <a href={url.data} target="_blank" rel="noopener noreferrer">
                  Read discussion <ArrowUpRight size={15} />
                </a>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
