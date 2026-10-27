import type { Extraction } from "./validation";
export interface Project {
  id: string;
  owner_id: string;
  title: string;
  mode: "niche" | "problem" | "competitor";
  icp: string;
  geography: string;
  keywords: string[];
  competitors: string[];
  includes: string[];
  excludes: string[];
  enabled_sources: string[];
  scheduled: boolean;
  created_at: string;
}
export interface Source {
  id: string;
  source: string;
  external_id: string;
  canonical_url: string;
  author_handle: string | null;
  title: string;
  permitted_excerpt: string;
  published_at: string | null;
  collected_at: string;
  expires_at: string;
  metadata: Record<string, string>;
}
export interface Signal {
  id: string;
  project_id: string;
  item_id: string;
  summary: string;
  category: string | null;
  score: number;
  evidence_completeness: number;
  status: string;
  extraction: Extraction;
  model_id: string;
  prompt_version: string;
  rules_version: string;
  created_at: string;
  source_items: Source;
  research_projects: { title: string };
}
export interface Run {
  id: string;
  project_id: string;
  state: string;
  created_at: string;
  started_at: string | null;
  fetched: number;
  accepted: number;
  duplicates: number;
  analyzed: number;
  errors: number;
  ai_calls: number;
  input_tokens: number;
  output_tokens: number;
  error_summary: string | null;
}
export interface Cluster {
  id: string;
  project_id: string;
  canonical_problem: string;
  summary: string;
  evidence_count: number;
  distinct_authors: number;
  distinct_discussions: number;
  score: number;
  manual_review_status: string;
}
export interface Prospect {
  id: string;
  project_id: string;
  source_item_id: string;
  display_name: string | null;
  public_handle: string | null;
  public_profile_url: string | null;
  company: string | null;
  professional_role: string | null;
  role_verified: boolean;
  identity_verified: boolean;
  verification_notes: string;
  buyer_classification: string;
  status: string;
  do_not_contact: boolean;
  source_items: Source;
}
export interface Draft {
  id: string;
  prospect_id: string;
  source_item_id: string;
  channel: string;
  approach: string;
  body: string;
  review_status: string;
  claims_confirmed: boolean;
  evidence_urls: string[];
  claimed_facts: { text: string; verified: boolean }[];
  model_id: string;
  updated_at: string;
}
export interface Interview {
  id: string;
  interview_date: string;
  notes: string;
  pain_confirmed: boolean | null;
  purchasing_authority: boolean | null;
  current_spend: string | null;
  paid_pilot_interest: string;
  next_action: string | null;
}
export interface Policy {
  source_id: string;
  source_name: string;
  access_mode: string;
  approval_status: string;
  enabled: boolean;
  disabled_reason: string | null;
  allowed_purpose: string;
  limits: Record<string, unknown>;
  retention_days: number;
  attribution: string;
  automated_fetch: boolean;
  last_verified_at: string | null;
}
