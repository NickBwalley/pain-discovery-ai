import { z } from "zod";

export const usernameSchema = z.string().trim().toLowerCase().min(3).max(32)
  .regex(/^[a-z0-9_]+$/, "Use 3–32 letters, numbers or underscores");
export const signupSchema = z.object({
  email: z.string().trim().pipe(z.email()).transform(value => value.toLowerCase()),
  username: usernameSchema,
  password: z.string().min(12, "Use at least 12 characters").max(256),
});

export function appOrigin() {
  const url = new URL(process.env.APP_URL || "http://localhost:3000");
  if (url.protocol !== "https:" && !(url.protocol === "http:" && url.hostname === "localhost"))
    throw new Error("APP_URL must use HTTPS (HTTP localhost is allowed for development)");
  return url.origin;
}

