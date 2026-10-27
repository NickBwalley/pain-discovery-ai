"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { configured, supabase } from "@/lib/supabase/server";
import { usernameSchema } from "@/lib/auth-input";
import { emailForUsername } from "@/lib/supabase/login-lookup";
function str(form: FormData, key: string) {
  return String(form.get(key) ?? "");
}

export async function login(form: FormData) {
  let ok = false;
  if (configured()) {
    const identifier = str(form, "identifier").trim().toLowerCase(),
      password = str(form, "password");
    const db = await supabase();
    let email: string | null = z.email().safeParse(identifier).success
      ? identifier
      : null;
    if (
      !identifier.includes("@") &&
      usernameSchema.safeParse(identifier).success
    ) {
      email = await emailForUsername(identifier);
    }
    if (email && password.length > 0 && password.length <= 256) {
      const result = await db.auth.signInWithPassword({ email, password });
      if (!result.error) {
        const claim = await db.rpc("ensure_user_profile");
        ok = !claim.error && claim.data === true;
        if (!ok) await db.auth.signOut();
      }
    }
  }
  redirect(
    ok
      ? "/"
      : "/login?notice=Sign-in%20failed.%20Check%20your%20credentials%20and%20confirm%20your%20email.%20You%20can%20also%20sign%20in%20using%20your%20email%20address.",
  );
}
export async function signOut() {
  if (configured()) {
    const db = await supabase();
    await db.auth.signOut();
  }
  redirect("/login");
}
