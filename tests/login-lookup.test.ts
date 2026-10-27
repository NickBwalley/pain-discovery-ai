import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({createClient:vi.fn(),rpc:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("@supabase/supabase-js",()=>({createClient:mocks.createClient}));
import { emailForUsername } from "../lib/supabase/login-lookup";
beforeEach(()=>{vi.resetAllMocks();mocks.createClient.mockReturnValue({rpc:mocks.rpc});vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL","https://example.supabase.co");});
afterEach(()=>vi.unstubAllEnvs());
it("uses a separate server client for private username resolution",async()=>{
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY","test-server-secret");
  mocks.rpc.mockResolvedValue({data:"member@example.com",error:null});
  expect(await emailForUsername("member")).toBe("member@example.com");
  expect(mocks.createClient).toHaveBeenCalledWith("https://example.supabase.co","test-server-secret",{auth:{persistSession:false,autoRefreshToken:false}});
  expect(mocks.rpc).toHaveBeenCalledWith("resolve_login_email",{p_username:"member"});
});
it("does not fall back to exposing a directory when the server key is missing",async()=>{
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY","");
  expect(await emailForUsername("member")).toBeNull();
  expect(mocks.createClient).not.toHaveBeenCalled();
});
