import { z } from "zod";
import { projectSchema } from "./validation";

export const researchCategories = [
  {
    id: "cybersecurity",
    label: "Cyber security",
    keywords: [
      "cybersecurity",
      "cyber security",
      "vulnerability",
      "security tool",
    ],
  },
  {
    id: "b2b",
    label: "B2B & SaaS",
    keywords: ["b2b", "saas", "enterprise", "procurement"],
  },
  {
    id: "founders",
    label: "Startup founders",
    keywords: ["founder", "startup", "bootstrapped", "bootstrapping"],
  },
  {
    id: "alternatives",
    label: "Software alternatives",
    keywords: ["alternative", "replacement", "replace", "switching from"],
  },
  {
    id: "automation",
    label: "AI & automation",
    keywords: ["automation", "llm", "chatgpt", "ai agent"],
  },
  {
    id: "developer-tools",
    label: "Developer tools",
    keywords: ["developer tool", "debugging", "deployment", "api"],
  },
  {
    id: "marketing",
    label: "Marketing & sales",
    keywords: ["marketing", "crm", "lead generation", "sales"],
  },
  {
    id: "ecommerce",
    label: "E-commerce",
    keywords: ["ecommerce", "e-commerce", "shopify", "online store"],
  },
  {
    id: "finance",
    label: "Finance & accounting",
    keywords: ["bookkeeping", "invoicing", "accounting", "reconciliation"],
  },
  {
    id: "people",
    label: "Hiring & people",
    keywords: ["recruiting", "hiring", "onboarding", "payroll"],
  },
] as const;

export type ResearchCategory = (typeof researchCategories)[number]["id"];
const ids = researchCategories.map((category) => category.id) as [
  ResearchCategory,
  ...ResearchCategory[],
];
export const categorySelection = z
  .array(z.enum(ids))
  .min(1, "Choose at least one category.")
  .max(5, "Choose up to five categories.")
  .transform((values) => [...new Set(values)]);

/** Presets use the existing schema; no extra form fields or migration required. */
export function researchProject(input: unknown) {
  const selected = categorySelection.parse(input);
  const categories = researchCategories.filter((category) =>
    selected.includes(category.id),
  );
  return projectSchema.parse({
    title: categories.map((category) => category.label).join(" + "),
    mode: "niche",
    icp: `Public discussions about ${categories.map((category) => category.label).join(", ")}.`,
    geography: "",
    keywords: [
      ...new Set(categories.flatMap((category) => [...category.keywords])),
    ],
    includes: [],
    excludes: [],
    competitors: [],
    enabled_sources: ["hacker_news"],
    scheduled: false,
  });
}

export function projectCategories(keywords: string[]): ResearchCategory[] {
  return researchCategories
    .filter((category) =>
      category.keywords.every((word) => keywords.includes(word)),
    )
    .map((category) => category.id);
}

export type ResearchFormState = { error: string } | null;
