import { z } from "zod";
const dimension = z.number().int().min(0).max(5).nullable();
export const extractionSchema = z.strictObject({
  is_relevant: z.boolean(),
  relevance_reason: z.string(),
  confidence: z.number().min(0).max(1),
  pain_summary: z.string().nullable(),
  problem_category: z.string().nullable(),
  pain_evidence: z
    .array(
      z.strictObject({
        exact_excerpt: z.string().min(1).max(4000),
        source_item_id: z.string(),
      }),
    )
    .max(8),
  customer_segment: z.string().nullable(),
  buyer_role: z.string().nullable(),
  buyer_role_evidence: z.string().nullable(),
  existing_workaround: z.string().nullable(),
  existing_product: z.string().nullable(),
  alternative_requested: z.boolean(),
  severity: dimension,
  frequency: dimension,
  evidence_of_spend: dimension,
  buyer_accessibility: dimension,
  urgency_signal: z.enum(["explicit", "inferred", "unknown"]),
  spend_signal: z.enum(["explicit", "inferred", "unknown"]),
  business_impact: z.string().nullable(),
  missing_information: z.array(z.string()),
});
export type Extraction = z.infer<typeof extractionSchema>;
export const idSchema = z.uuid();
export const publicUrl = z
  .string()
  .url()
  .max(2048)
  .refine((value) => {
    const u = new URL(value);
    const host = u.hostname.replace(/\.$/, "");
    return (
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      !u.port &&
      !/^(localhost|.*\.localhost|.*\.local|.*\.internal|.*\.test|.*\.invalid)$/.test(
        host,
      ) &&
      !/^[\d.]+$/.test(host) &&
      !host.includes(":") &&
      host.includes(".") &&
      !Array.from(u.searchParams.keys()).some((key) =>
        /^(access_token|api_key|password|secret|session|token)$/i.test(key),
      )
    );
  }, "Use a public HTTPS source URL without credentials or a custom port");
const terms = z.array(z.string().min(1).max(100)).min(0).max(20);
export const projectSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    mode: z.enum(["niche", "problem", "competitor"]),
    icp: z.string().trim().max(3000),
    geography: z.string().trim().max(150),
    keywords: terms.min(1),
    competitors: terms,
    includes: terms,
    excludes: terms,
    enabled_sources: z.array(z.enum(["hacker_news", "manual", "public_web"])).min(1),
    scheduled: z.boolean(),
  })
  .refine(
    (p) => p.mode !== "competitor" || p.competitors.length > 0,
    "Competitor research needs a product name",
  );
export const statusSchema = z.enum([
  "draft",
  "reviewed",
  "copied",
  "contacted_manually",
  "responded",
  "interviewed",
  "not_interested",
  "pilot_candidate",
]);
export const prospectSchema = z
  .object({
    display_name: z.string().trim().max(160).nullable(),
    company: z.string().trim().max(160).nullable(),
    professional_role: z.string().trim().max(160).nullable(),
    public_profile_url: publicUrl.nullable(),
    role_verified: z.boolean(),
    identity_verified: z.boolean(),
    verification_notes: z.string().trim().max(3000),
    buyer_classification: z.enum([
      "author",
      "affected_user",
      "influencer",
      "economic_buyer",
      "unknown",
    ]),
    do_not_contact: z.boolean(),
  })
  .refine(
    (p) =>
      !p.role_verified || (!!p.professional_role && !!p.verification_notes),
    "Verified role requires notes",
  )
  .refine(
    (p) => !p.identity_verified || (!!p.display_name && !!p.verification_notes),
    "Verified identity requires notes",
  )
  .refine(
    (p) => p.buyer_classification !== "economic_buyer" || p.role_verified,
    "Economic buyer classification needs a verified role",
  );
export function parseTerms(value: FormDataEntryValue | null) {
  return String(value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
export function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}
export function hasPrivateContact(value: string) {
  return /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|(?:\+?\d[\s().-]*){9,}/i.test(
    value,
  );
}
export function priority(extraction: Extraction) {
  return 5 * ((extraction.severity ?? 0) + (extraction.frequency ?? 0) +
    (extraction.evidence_of_spend ?? 0) + (extraction.buyer_accessibility ?? 0));
}
