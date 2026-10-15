import "./load-env.js";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";

async function waitForHealth(url: string, timeoutMs = 60_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        const body = (await res.json()) as { status?: string };
        if (body.status === "ready") return;
      }
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function main() {
  const build = spawnSync("npm", ["run", "build"], { stdio: "inherit" });
  if (build.status !== 0) process.exit(build.status ?? 1);

  let child: ChildProcess | undefined;
  try {
    child = spawn("npm", ["run", "start"], {
      stdio: "inherit",
      env: { ...process.env, NODE_ENV: "production", AI_MODE: process.env.AI_MODE || "fixture" },
    });
    await waitForHealth("http://127.0.0.1:3000/api/health");
    const cypress = spawnSync("npx", ["cypress", "run", "--e2e", "--browser", "electron"], {
      stdio: "inherit",
      env: { ...process.env, CYPRESS_baseUrl: "http://127.0.0.1:3000" },
    });
    process.exitCode = cypress.status ?? 1;
  } finally {
    if (child?.pid) {
      try {
        process.kill(child.pid, "SIGTERM");
      } catch {
        /* ignore */
      }
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
