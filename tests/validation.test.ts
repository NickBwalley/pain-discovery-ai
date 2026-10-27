import { describe, it, expect } from "vitest";
import {
  publicUrl,
  priority,
  projectSchema,
  prospectSchema,
  hasPrivateContact,
  extractionSchema,
} from "../lib/validation";
import { createDraft } from "../lib/outreach";
import type { Prospect, Source } from "../lib/types";
import { readFileSync } from "node:fs";
const extraction = {
  is_relevant: true,
  relevance_reason: "Complaint",
  confidence: 0.8,
  pain_summary: "Reporting takes hours",
  problem_category: null,
  pain_evidence: [
    { exact_excerpt: "Reporting takes hours", source_item_id: "item" },
  ],
  customer_segment: null,
  buyer_role: null,
  buyer_role_evidence: null,
  existing_workaround: null,
  existing_product: null,
  alternative_requested: false,
  severity: 3,
  frequency: 4,
  evidence_of_spend: null,
  buyer_accessibility: null,
  urgency_signal: "unknown",
  spend_signal: "unknown",
  business_impact: null,
  missing_information: [],
} as const;
describe("evidence and input boundaries", () => {
  it("mirrors Python required fields and dimension bounds", () => {
    const schema = JSON.parse(
      readFileSync("schemas/extraction.schema.json", "utf8"),
    );
    expect(Object.keys(extractionSchema.shape).sort()).toEqual(
      schema.required.sort(),
    );
    for (const key of [
      "severity",
      "frequency",
      "evidence_of_spend",
      "buyer_accessibility",
    ]) {
      expect(schema.properties[key].anyOf).toContainEqual({
        type: "integer",
        minimum: 0,
        maximum: 5,
      });
      expect(
        extractionSchema.safeParse({ ...extraction, [key]: 6 }).success,
      ).toBe(false);
      expect(
        extractionSchema.safeParse({ ...extraction, [key]: null }).success,
      ).toBe(true);
    }
  });
  it("unknown ranking dimensions are zero", () =>
    expect(priority(extractionSchema.parse(extraction))).toBe(35));
  it("each category contributes equally and totals stay out of 100", () => {
    const base = extractionSchema.parse({...extraction, severity:null, frequency:null});
    expect(priority(base)).toBe(0);
    for(const key of ["severity","frequency","evidence_of_spend","buyer_accessibility"] as const)
      expect(priority({...base,[key]:5})).toBe(25);
    expect(priority({...base,severity:5,frequency:5,evidence_of_spend:5,buyer_accessibility:5})).toBe(100);
  });
  it.each([
    "http://example.com",
    "https://127.0.0.1",
    "https://localhost",
    "https://[::1]",
    "https://user:pass@example.com",
    "javascript:alert(1)",
    "https://db.internal",
    "https://example.com:9000",
  ])("rejects unsafe attribution URL %s", (url) =>
    expect(publicUrl.safeParse(url).success).toBe(false),
  );
  it("allows a normal public HTTPS attribution URL", () =>
    expect(publicUrl.parse("https://news.ycombinator.com/item?id=1")).toContain(
      "news.ycombinator.com",
    ));
  it("blocks contact details", () => {
    expect(hasPrivateContact("me@example.com")).toBe(true);
    expect(hasPrivateContact("call +1 212 555 0134")).toBe(true);
  });
  it("requires keywords and a competitor when using competitor mode", () => {
    expect(
      projectSchema.safeParse({
        title: "test",
        mode: "competitor",
        icp: "",
        geography: "",
        keywords: ["alternative"],
        competitors: [],
        includes: [],
        excludes: [],
        enabled_sources: ["hacker_news"],
        scheduled: false,
      }).success,
    ).toBe(false);
  });
  it("requires independent evidence for a verified identity", () =>
    expect(
      prospectSchema.safeParse({
        display_name: "Alex",
        company: null,
        professional_role: null,
        public_profile_url: null,
        role_verified: false,
        identity_verified: true,
        verification_notes: "",
        buyer_classification: "author",
        do_not_contact: false,
      }).success,
    ).toBe(false));
});
describe("grounded drafts", () => {
  const source = {
    id: "item",
    permitted_excerpt: "Reporting takes hours every week.",
    canonical_url: "https://news.ycombinator.com/item?id=1",
  } as Source;
  const prospect = {
    identity_verified: false,
    display_name: "Invented Name",
    do_not_contact: false,
  } as Prospect;
  it("uses a generic greeting when real identity is unverified", () => {
    const d = createDraft(
      prospect,
      source,
      "Reporting takes hours",
      "interview",
    );
    expect(d.body.startsWith("Hi,\n")).toBe(true);
    expect(d.body).not.toContain("Invented Name");
    expect(d.body.split(/\s+/).length).toBeLessThan(100);
    expect(d.evidence_urls).toEqual([source.canonical_url]);
  });
  it("rejects invented facts and suppressed prospects", () => {
    expect(() =>
      createDraft(prospect, source, "We spent $500", "pilot"),
    ).toThrow();
    expect(() =>
      createDraft(
        { ...prospect, do_not_contact: true },
        source,
        "Reporting takes hours",
        "interview",
      ),
    ).toThrow();
  });
});
