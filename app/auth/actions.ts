"use server";
import { redirect } from "next/navigation";
import { configured, supabase } from "@/lib/supabase/server";
import { appOrigin, signupSchema } from "@/lib/auth-input";

const notice = (message: string) =>
  `/login?notice=${encodeURIComponent(message)}`;

export async function signup(form: FormData) {
  const input = signupSchema.safeParse(Object.fromEntries(form));
  if (!configured() || !input.success)
    redirect(
      notice(
        "Use a valid email, a username with 3–32 letters/numbers/underscores and a password of at least 12 characters.",
      ),
    );
  const db = await supabase();
  const { error } = await db.auth.signUp({
    email: input.data.email,
    password: input.data.password,
    options: {
      data: { username: input.data.username },
      emailRedirectTo: `${appOrigin()}/auth/callback`,
    },
  });
  if (error)
    redirect(
      notice(
        "Signup could not be completed. Try another username, sign in if already registered, or try again later.",
      ),
    );
  redirect(
    notice(
      "Check your email to confirm your account, then sign in. Existing accounts can sign in directly.",
    ),
  );
}

export async function googleLogin() {
  if (!configured()) redirect(notice("Configure Supabase before signing in."));
  const db = await supabase();
  const { data, error } = await db.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${appOrigin()}/auth/callback`,
      queryParams: { prompt: "select_account" },
    },
  });
  if (error || !data.url)
    redirect(
      notice(
        "Google sign-in is unavailable. Enable the Google provider in Supabase.",
      ),
    );
  redirect(data.url);
}
