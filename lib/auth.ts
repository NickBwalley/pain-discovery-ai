import "server-only";
import { redirect } from "next/navigation";
import { configured, supabase } from "./supabase/server";
export async function requireUser() {
  if (!configured()) redirect("/login");
  const db = await supabase();
  const {
    data: { user },
    error,
  } = await db.auth.getUser();
  if (
    error ||
    !user ||
    !user.email_confirmed_at
  )
    redirect("/login");
  const { data: allowed, error: allowError } = await db.rpc("ensure_user_profile");
  if (allowError || !allowed)
    redirect(
      "/login?notice=Account%20setup%20failed.%20Check%20database%20migrations%20and%20try%20again.",
    );
  return { db, user };
}
