#!/usr/bin/env node
/**
 * External reproduction: exercise the Trip inspect adapter and open the
 * resulting file with the public AgentInspect reader.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tw-audit-writer-"));
process.env.TW_AGENT_INSPECT = "1";
process.env.TW_AGENT_INSPECT_DIR = tmp;

const adapterUrl = pathToFileURL(
  path.resolve("src/server/adapters/inspect.ts"),
).href;
const { getInspectAdapter, inspectRun, inspectStep, shutdownInspectAdapter } =
  await import(adapterUrl);
const { openTraceFile } = await import("agent-inspect/readers");

getInspectAdapter({ enabled: true, traceDir: tmp });
await inspectRun(
  "audit-trip-update",
  async () => {
    await inspectStep(
      "trip.patch",
      async () => ({ ok: true }),
      { type: "tool", metadata: { domain: "trip", operation: "update" } },
    );
  },
  { enabled: true, traceDir: tmp },
);
await shutdownInspectAdapter();

const file = fs.readdirSync(tmp).find((n) => n.endsWith(".jsonl"));
if (!file) {
  console.error(JSON.stringify({ ok: false, reason: "no jsonl written", tmp }));
  process.exit(1);
}
const full = path.join(tmp, file);
const read = await openTraceFile(full);
console.log(
  JSON.stringify(
    {
      ok: true,
      file: full,
      events: read.events.length,
      names: [...new Set(read.events.map((e) => e.name))],
      runIds: [...new Set(read.events.map((e) => e.runId))],
    },
    null,
    2,
  ),
);
fs.rmSync(tmp, { recursive: true, force: true });
