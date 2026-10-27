import { beforeEach, afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  emailForUsername: vi.fn(), signUp: vi.fn(), signInWithPassword: vi.fn(), signInWithOAuth: vi.fn(), exchangeCodeForSession: vi.fn(), getUser: vi.fn(), signOut: vi.fn(), rpc: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ configured: () => true, supabase: async () => ({ auth: mocks, rpc: mocks.rpc }) }));
vi.mock("@/lib/auth", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/supabase/login-lookup", () => ({ emailForUsername: mocks.emailForUsername }));
vi.mock("@/lib/data", () => ({ check: vi.fn(), single: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
import { signup, googleLogin } from "../app/auth/actions";
import { login } from "../app/actions";
import { GET } from "../app/auth/callback/route";
import { NextRequest } from "next/server";

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("APP_URL", "https://research.example.com");
  mocks.emailForUsername.mockResolvedValue("member@example.com");
  mocks.signUp.mockResolvedValue({error:null});
  mocks.signInWithPassword.mockResolvedValue({error:null});
  mocks.signInWithOAuth.mockResolvedValue({data:{url:"https://accounts.google.com/oauth"},error:null});
  mocks.exchangeCodeForSession.mockResolvedValue({error:null});
  mocks.getUser.mockResolvedValue({data:{user:{email:"owner@example.com",email_confirmed_at:"2026-10-27"}}});
  mocks.rpc.mockResolvedValue({data:true,error:null});
});
afterEach(() => vi.unstubAllEnvs());
const signupForm = (email = "owner@example.com") => {
  const form = new FormData();
  for(const [key,value] of Object.entries({email,username:"my_owner",password:"a-long-password-123"})) form.set(key,value);
  return form;
};

it("signs up any account with username metadata and a fixed confirmation callback", async () => {
  await expect(signup(signupForm())).rejects.toThrow("Check%20your%20email");
  expect(mocks.signUp).toHaveBeenCalledWith({email:"owner@example.com",password:"a-long-password-123",options:{data:{username:"my_owner"},emailRedirectTo:"https://research.example.com/auth/callback"}});
});
it("accepts signup from another email without an owner allowlist", async () => {
  await expect(signup(signupForm("other@example.com"))).rejects.toThrow("Check%20your%20email");
  expect(mocks.signUp).toHaveBeenCalledWith(expect.objectContaining({email:"other@example.com"}));
});
it("resolves the supplied username on the server before password sign-in", async () => {
  const form = new FormData(); form.set("identifier","MY_OWNER"); form.set("password","a-long-password-123");
  await expect(login(form)).rejects.toThrow("redirect:/");
  expect(mocks.emailForUsername).toHaveBeenCalledWith("my_owner");
  expect(mocks.signInWithPassword).toHaveBeenCalledWith({email:"member@example.com",password:"a-long-password-123"});
  expect(mocks.rpc).toHaveBeenCalledWith("ensure_user_profile");
});
it("rejects an unknown username and revokes sessions when the database denies access", async () => {
  const form = new FormData(); form.set("identifier","unknown"); form.set("password","a-long-password-123");
  mocks.emailForUsername.mockResolvedValue(null);
  await expect(login(form)).rejects.toThrow("Sign-in%20failed");
  expect(mocks.signInWithPassword).not.toHaveBeenCalled();
  form.set("identifier","another@example.com");
  mocks.rpc.mockResolvedValue({data:false,error:null});
  await expect(login(form)).rejects.toThrow("Sign-in%20failed");
  expect(mocks.signOut).toHaveBeenCalled();
});
it("starts Google PKCE signup/sign-in at the fixed callback", async () => {
  await expect(googleLogin()).rejects.toThrow("redirect:https://accounts.google.com/oauth");
  expect(mocks.signInWithOAuth).toHaveBeenCalledWith({provider:"google",options:{redirectTo:"https://research.example.com/auth/callback",queryParams:{prompt:"select_account"}}});
});
it("exchanges a code, confirms account access and ignores arbitrary redirect parameters", async () => {
  const result = await GET(new NextRequest("https://research.example.com/auth/callback?code=test&next=https://evil.example"));
  expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith("test");
  expect(mocks.rpc).toHaveBeenCalledWith("ensure_user_profile");
  expect(result.headers.get("location")).toBe("https://research.example.com/");
});
it.each(["unconfirmed","profile-error","bad-code"])("rejects OAuth callback: %s", async (reason) => {
  if(reason==="unconfirmed") mocks.getUser.mockResolvedValue({data:{user:{email:"owner@example.com",email_confirmed_at:null}}});
  if(reason==="profile-error") mocks.rpc.mockResolvedValue({data:false,error:null});
  if(reason==="bad-code") mocks.exchangeCodeForSession.mockResolvedValue({error:new Error("Invalid code")});
  const result = await GET(new NextRequest("https://research.example.com/auth/callback?code=test"));
  expect(result.headers.get("location")).toContain("https://research.example.com/login?notice=");
  if(reason!=="bad-code") expect(mocks.signOut).toHaveBeenCalled();
});

it("accepts Google login for any confirmed email", async () => {
  mocks.getUser.mockResolvedValue({data:{user:{email:"new-member@example.com",email_confirmed_at:"2026-10-27"}}});
  const result = await GET(new NextRequest("https://research.example.com/auth/callback?code=test"));
  expect(result.headers.get("location")).toBe("https://research.example.com/");
});
it("signs in by arbitrary email without a username lookup", async () => {
  const form = new FormData(); form.set("identifier","person@example.com"); form.set("password","a-long-password-123");
  await expect(login(form)).rejects.toThrow("redirect:/");
  expect(mocks.emailForUsername).not.toHaveBeenCalled();
  expect(mocks.signInWithPassword).toHaveBeenCalledWith({email:"person@example.com",password:"a-long-password-123"});
});
