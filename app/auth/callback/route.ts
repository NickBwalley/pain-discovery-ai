import { NextRequest, NextResponse } from "next/server";
import { supabase, configured } from "@/lib/supabase/server";
import { appOrigin } from "@/lib/auth-input";

export async function GET(request: NextRequest) {
  const failure = () => NextResponse.redirect(new URL("/login?notice=Sign-in%20failed.%20Confirm%20your%20email%20and%20try%20again.", appOrigin()));
  const code = request.nextUrl.searchParams.get("code");
  if (!code || !configured()) return failure();
  const db = await supabase();
  const { error } = await db.auth.exchangeCodeForSession(code);
  if (error) return failure();
  const { data: { user } } = await db.auth.getUser();
  if (!user?.email_confirmed_at) {
    await db.auth.signOut();
    return failure();
  }
  const { data: allowed, error: claimError } = await db.rpc("ensure_user_profile");
  if (claimError || !allowed) { await db.auth.signOut(); return failure(); }
  return NextResponse.redirect(new URL("/", appOrigin()));
}
