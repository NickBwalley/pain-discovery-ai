import { NextResponse } from "next/server";
import { configured, supabase } from "@/lib/supabase/server";
import { idSchema } from "@/lib/validation";
import { researchStatusSchema } from "@/lib/research-status";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!idSchema.safeParse(id).success)
    return NextResponse.json(
      { error: "Invalid research" },
      { status: 400, headers },
    );
  if (!configured())
    return NextResponse.json(
      { error: "Sign in required" },
      { status: 401, headers },
    );
  const db = await supabase();
  const {
    data: { user },
    error: authError,
  } = await db.auth.getUser();
  if (authError || !user?.email_confirmed_at)
    return NextResponse.json(
      { error: "Sign in required" },
      { status: 401, headers },
    );
  const { data, error } = await db
    .from("discovery_runs")
    .select("id,state,created_at,started_at")
    .eq("project_id", id)
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error)
    return NextResponse.json(
      { error: "Status unavailable" },
      { status: 503, headers },
    );
  if (!data)
    return NextResponse.json(
      { error: "Research not found" },
      { status: 404, headers },
    );
  const status = researchStatusSchema.safeParse(data);
  if (!status.success)
    return NextResponse.json(
      { error: "Status unavailable" },
      { status: 503, headers },
    );
  return NextResponse.json(status.data, { headers });
}
