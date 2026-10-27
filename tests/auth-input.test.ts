import { afterEach, describe, expect, it, vi } from "vitest";
import { appOrigin, signupSchema, usernameSchema } from "../lib/auth-input";

afterEach(() => vi.unstubAllEnvs());
describe("signup input", () => {
  it("normalizes usernames and rejects invalid or oversized input", () => {
    expect(usernameSchema.parse(" My_Owner ")).toBe("my_owner");
    for (const bad of ["ab", "has space", "<script>", "a".repeat(33)]) expect(usernameSchema.safeParse(bad).success).toBe(false);
    expect(signupSchema.safeParse({ email: "owner@example.com", username: "owner", password: "short" }).success).toBe(false);
  });
  it("accepts any valid signup email", () => {
    expect(signupSchema.parse({ email:"new-member@example.com", username:"new_member", password:"a-long-password-123" }).email).toBe("new-member@example.com");
  });
  it("uses a fixed safe redirect origin", () => {
    vi.stubEnv("APP_URL", "https://research.example.com/some/path");
    expect(appOrigin()).toBe("https://research.example.com");
    vi.stubEnv("APP_URL", "http://research.example.com");
    expect(() => appOrigin()).toThrow();
    vi.stubEnv("APP_URL", "http://localhost:3000");
    expect(appOrigin()).toBe("http://localhost:3000");
  });
});
