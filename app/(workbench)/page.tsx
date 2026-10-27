import { ResearchForm } from "@/components/research-form";
export default function Home() {
  return (
    <section className="research-home">
      <div className="research-intro">
        <p className="research-eyebrow">
          <span /> YOUR NEXT IDEA STARTS HERE
        </p>
        <h1>
          Good ideas start with
          <br />
          <em>the right questions.</em>
        </h1>
        <p>Pick what interests you. Find what people are talking about.</p>
      </div>
      <div className="research-search-panel">
        <ResearchForm />
      </div>
      <p className="research-source-note">
        Conversations from Hacker News. Original sources, always.
      </p>
    </section>
  );
}
