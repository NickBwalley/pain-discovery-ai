import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

export function workerEnvironment(env) {
  // Next's .env.local precedence is shared with the worker. Never copy/print keys.
  return {
    ...env,
    SUPABASE_URL: env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL,
  };
}

export function startDevelopment({
  root = process.cwd(),
  env = process.env,
  args = [],
  platform = process.platform,
  spawnProcess = spawn,
  exists = existsSync,
  log = console.log,
} = {}) {
  const onlyWorker = args[0] === "--worker-only";
  const python = resolve(
    root,
    platform === "win32" ? ".venv/Scripts/python.exe" : ".venv/bin/python",
  );
  const workerEnv = workerEnvironment(env);
  const children = [];
  let stopping = false;
  let worker;
  const stopChild = (child) => {
    if (!child?.pid || child.exitCode !== null) return;
    if (platform === "win32")
      spawnProcess("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
    else child.kill("SIGTERM");
  };
  function launch(command, commandArgs, childEnv) {
    const child = spawnProcess(command, commandArgs, {
      cwd: root,
      env: childEnv,
      stdio: "inherit",
      windowsHide: true,
    });
    children.push(child);
    child.on("error", () =>
      log(
        "[dev] A process could not start. Check the local environment and installed dependencies.",
      ),
    );
    return child;
  }
  if (exists(python)) {
    log(
      "[worker] Starting research worker with the web app's Supabase configuration.",
    );
    worker = launch(
      python,
      [
        "-m",
        "pain_discovery.cli",
        ...(onlyWorker && args.length > 1 ? args.slice(1) : ["watch"]),
      ],
      workerEnv,
    );
    worker.on("exit", (code) => {
      if (!stopping && code)
        log(
          "[worker] Stopped. Check Supabase settings in .env.local and the Python setup in README.md.",
        );
      if (onlyWorker) process.exitCode = code ?? 1;
    });
  } else {
    log(
      "[worker] Python environment missing. Install the worker with the README commands; searches cannot run without it.",
    );
    if (onlyWorker) process.exitCode = 1;
  }
  const web = onlyWorker
    ? undefined
    : launch(
        process.execPath,
        [require.resolve("next/dist/bin/next"), "dev", ...args],
        env,
      );
  web?.on("exit", (code) => {
    stopping = true;
    stopChild(worker);
    process.exitCode = code ?? 0;
  });
  return {
    web,
    worker,
    stop() {
      if (stopping) return;
      stopping = true;
      for (const child of children) stopChild(child);
    },
  };
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  process.env.NODE_ENV ??= "development";
  const { loadEnvConfig } = require("@next/env");
  loadEnvConfig(process.cwd(), true);
  const processes = startDevelopment({ args: process.argv.slice(2) });
  const shutdown = () => {
    processes.stop();
    setTimeout(() => process.exit(0), 1500).unref();
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}
