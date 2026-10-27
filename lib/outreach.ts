import type { Prospect, Source } from "./types";
export function createDraft(
  prospect: Prospect,
  source: Source,
  quote: string,
  approach: "interview" | "helpful" | "pilot",
) {
  if (prospect.do_not_contact) throw new Error("Do-not-contact prospect");
  if (!quote || !source.permitted_excerpt.includes(quote))
    throw new Error("An exact source quote is required");
  const short = quote.split(/\s+/).slice(0, 32).join(" ");
  // Slicing at word boundaries preserves exactness except multi-space normalization: fall back to original prefix.
  const excerpt = quote.includes(short) ? short : quote.slice(0, 180);
  const hello =
    prospect.identity_verified && prospect.display_name
      ? `Hi ${prospect.display_name},`
      : "Hi,";
  const question =
    approach === "interview"
      ? "Would you be open to a 15–20 minute conversation about how you handle this today?"
      : approach === "helpful"
        ? "What have you tried so far, and what would make that workflow easier?"
        : "What would you need to see before considering a small paid pilot to address this issue?";
  return {
    body: `${hello}\n\nIn your public discussion, you wrote: “${excerpt}”. I’m researching that issue. ${question}`,
    claimed_facts: [{ text: excerpt, verified: true }],
    evidence_urls: [source.canonical_url],
    identity_note: prospect.identity_verified
      ? "Identity independently verified by owner"
      : "Professional identity and purchasing authority are unverified; generic greeting used",
  };
}
