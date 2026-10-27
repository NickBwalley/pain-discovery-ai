import { login } from "@/app/actions";
import { googleLogin, signup } from "@/app/auth/actions";
import Link from "next/link";
import { configured } from "@/lib/supabase/server";
import { Submit } from "@/components/submit";
import { Notice } from "@/components/workbench";
import { Fingerprint } from "lucide-react";
export const dynamic = "force-dynamic";
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; mode?: string }>;
}) {
  const { notice, mode } = await searchParams,
    ready = configured();
  const signingUp = mode === "signup";
  return (
    <main className="login">
      <section className="login-story">
        <Fingerprint size={48} />
        <p className="eyebrow">PAIN DISCOVERY / PRIVATE RESEARCH</p>
        <h1>
          Find the problem
          <br />
          worth solving.
        </h1>
        <p>
          Follow the evidence from a real discussion to a better conversation.
        </p>
        <div className="login-rule" />
        <span>01 / Observe &nbsp; 02 / Understand &nbsp; 03 / Talk</span>
      </section>
      <section className="login-form">
        <p className="eyebrow">
          {signingUp ? "START YOUR RESEARCH" : "YOUR RESEARCH WORKSPACE"}
        </p>
        <h2>{signingUp ? "Create your account." : "Welcome back."}</h2>
        <p className="muted">
          {signingUp
            ? "Sign up with Google or choose a username and password."
            : "Sign in with Google, your email or your username."}{" "}
          Your research stays private to your account.
        </p>
        <Notice message={notice} />
        {!ready ? (
          <div className="notice">
            <strong>Configuration required</strong>
            <p>
              Set the Supabase URL and public key in .env.local, and apply the
              migrations. See README.md for setup. No sample findings are
              loaded.
            </p>
          </div>
        ) : (
          <>
            <form action={googleLogin}>
              <Submit pending="Opening Google…" variant="secondary">
                Continue with Google
              </Submit>
            </form>
            <p className="fine">or use a password</p>
            <form action={signingUp ? signup : login}>
              {signingUp && (
                <label>
                  Email
                  <input
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                  />
                </label>
              )}
              <label>
                {signingUp ? "Username" : "Username or email"}
                <input
                  name={signingUp ? "username" : "identifier"}
                  type="text"
                  autoComplete="username"
                  maxLength={signingUp ? 32 : 254}
                  minLength={signingUp ? 3 : 1}
                  pattern={signingUp ? "[A-Za-z0-9_]+" : undefined}
                  required
                />
              </label>
              <label>
                Password
                <input
                  name="password"
                  type="password"
                  autoComplete={signingUp ? "new-password" : "current-password"}
                  minLength={signingUp ? 12 : 1}
                  maxLength={256}
                  required
                />
              </label>
              <Submit pending={signingUp ? "Creating account…" : "Signing in…"}>
                {signingUp ? "Create account" : "Sign in"}
              </Submit>
            </form>
            <p className="fine">
              <Link href={signingUp ? "/login" : "/signup"}>
                {signingUp
                  ? "Already registered? Sign in"
                  : "New here? Create an account"}
              </Link>
            </p>
          </>
        )}
        <p className="fine">
          Choose a category. Find a conversation worth exploring.
        </p>
      </section>
    </main>
  );
}
