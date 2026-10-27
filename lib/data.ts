import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { notFound } from "next/navigation";
export function check(error: { message: string; code?: string } | null) {
  if (error) {
    if (error.code === "23505")
      throw new Error(
        "This record already exists, or a discovery run is already active.",
      );
    if (
      error.code === "P0001" &&
      /^(Hourly job cap reached|Hourly draft cap reached|Prospect is globally suppressed|Source was removed)/.test(
        error.message,
      )
    )
      throw new Error(error.message);
    throw new Error(
      "Database operation failed. Verify migrations, owner permissions and configuration.",
    );
  }
}
export async function list<T>(
  db: SupabaseClient,
  table: string,
  select = "*",
  order = "created_at",
  limit = 100,
): Promise<T[]> {
  const result = await db
    .from(table)
    .select(select)
    .order(order, { ascending: false })
    .limit(limit);
  check(result.error);
  return result.data as T[];
}
export async function single<T>(
  db: SupabaseClient,
  table: string,
  id: string,
  select = "*",
): Promise<T> {
  const result = await db.from(table).select(select).eq("id", id).maybeSingle();
  check(result.error);
  if (!result.data) notFound();
  return result.data as T;
}
export const signalSelect = "*,source_items!inner(*),research_projects(title)";
