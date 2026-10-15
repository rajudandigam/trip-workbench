import "./load-env.js";
import { spawn, type ChildProcess } from "node:child_process";

const children: ChildProcess[] = [];

function start(command: string, args: string[], env: NodeJS.ProcessEnv = {}) {
  const child = spawn(command, args, {
    stdio: "inherit",
    env: { ...process.env, ...env },
    shell: process.platform === "win32",
  });
  children.push(child);
  child.on("exit", (code) => {
    if (code && code !== 0) shutdown(code);
  });
}

function shutdown(code = 0) {
  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM");
  }
  process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

start("tsx", ["src/server/index.ts"], { NODE_ENV: "development" });
start("vite", [], { NODE_ENV: "development" });

console.log("Dev processes started (API + Vite). Ctrl+C stops both.");
