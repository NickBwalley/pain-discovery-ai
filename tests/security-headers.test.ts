import { afterEach, expect, it, vi } from "vitest";
import config from "../next.config";

afterEach(() => vi.unstubAllEnvs());

async function policy() {
  const rules = await config.headers!();
  return rules.flatMap(rule => rule.headers)
    .find(header => header.key === "Content-Security-Policy")!.value;
}

it("allows React development debugging under the development CSP", async () => {
  vi.stubEnv("NODE_ENV", "development");
  expect(await policy()).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval'");
});

it.each(["production", "test", undefined])("keeps eval disabled outside development (%s)", async environment => {
  vi.stubEnv("NODE_ENV", environment);
  expect(await policy()).not.toContain("'unsafe-eval'");
  expect(await policy()).toContain("frame-ancestors 'none'");
});
