import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { startDevelopment, workerEnvironment } from "./dev.mjs";

test("local worker uses the web project's configuration without modifying env input", () => {
  const env = {
    NEXT_PUBLIC_SUPABASE_URL: "https://web-project.example",
    SUPABASE_URL: "YOUR_PROJECT",
    SUPABASE_SERVICE_ROLE_KEY: "fixture-secret",
  };
  assert.equal(
    workerEnvironment(env).SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_URL,
  );
  assert.equal(
    workerEnvironment(env).SUPABASE_SERVICE_ROLE_KEY,
    "fixture-secret",
  );
  assert.equal(env.SUPABASE_URL, "YOUR_PROJECT");
});

test("development starts web and Python together and scopes cleanup to its own children", () => {
  const calls = [];
  const spawnProcess = (command, args, options) => {
    const child = Object.assign(new EventEmitter(), {
      pid: 100 + calls.length,
      exitCode: null,
    });
    calls.push({ command, args, options, child });
    return child;
  };
  const processes = startDevelopment({
    root: process.cwd(),
    env: { NEXT_PUBLIC_SUPABASE_URL: "https://fixture.example" },
    args: ["--port", "3200"],
    platform: "win32",
    exists: () => true,
    spawnProcess,
    log: () => {},
  });
  assert.deepEqual(calls[0].args, ["-m", "pain_discovery.cli", "watch"]);
  assert.deepEqual(calls[1].args.slice(-3), ["dev", "--port", "3200"]);
  processes.stop();
  assert.deepEqual(
    calls.slice(2).map((call) => call.args),
    [
      ["/PID", "100", "/T", "/F"],
      ["/PID", "101", "/T", "/F"],
    ],
  );
});

test("worker-only mode supports a bounded one-off command", () => {
  const calls = [];
  startDevelopment({
    args: ["--worker-only", "run-once", "--max-jobs", "1"],
    exists: () => true,
    spawnProcess: (command, args) => {
      calls.push({ command, args });
      return Object.assign(new EventEmitter(), { pid: 1, exitCode: null });
    },
    log: () => {},
  });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].args, [
    "-m",
    "pain_discovery.cli",
    "run-once",
    "--max-jobs",
    "1",
  ]);
});
