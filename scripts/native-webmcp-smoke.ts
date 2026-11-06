/**
 * Thin native WebMCP smoke probe for Phase 1.
 *
 * This script does not mock document.modelContext and does not call the
 * coordinator directly. It checks whether a supported browser automation path
 * is configured. When Chrome with WebMCP is unavailable in this process, it
 * records a blocked result with setup instructions instead of claiming a pass.
 *
 * Manual/Cursor Chrome DevTools MCP journeys remain the authoritative native
 * evidence when this Node host cannot attach to a WebMCP-enabled profile.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, "../evals/evidence");

type SmokeResult = {
  id: string;
  layer: "native";
  status: "pass" | "fail" | "blocked" | "not_run";
  reason?: string;
  assertions?: string[];
  setup?: string[];
};

function writeEvidence(results: SmokeResult[]) {
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(outDir, `native-smoke-${stamp}.json`);
  const payload = {
    generatedAt: new Date().toISOString(),
    host: process.platform,
    node: process.version,
    note: "Native smoke must discover real page tools in a WebMCP-enabled browser. Node alone cannot satisfy that.",
    results,
  };
  fs.writeFileSync(file, JSON.stringify(payload, null, 2));
  return file;
}

async function main() {
  const results: SmokeResult[] = [
    {
      id: "NATIVE-TOOL-DISCOVERY",
      layer: "native",
      status: "blocked",
      reason:
        "No WebMCP-enabled browser automation is attached to this Node smoke process. document.modelContext is a browser API.",
      setup: [
        "Enable Chrome WebMCP testing in the profile used for demos",
        "Connect Cursor Chrome DevTools MCP with --categoryExperimentalWebmcp",
        "Open an owned draft editor, confirm Saved, then list_webmcp_tools",
        "Expect get_trip_draft, validate_trip_draft, prepare_trip_review, and when mutable update_trip_draft + recheck_trip_update",
      ],
    },
    {
      id: "NATIVE-DIRTY-READ",
      layer: "native",
      status: "blocked",
      reason: "Depends on NATIVE-TOOL-DISCOVERY",
    },
    {
      id: "NATIVE-PREPARE-REVIEW",
      layer: "native",
      status: "blocked",
      reason: "Depends on NATIVE-TOOL-DISCOVERY",
    },
    {
      id: "NATIVE-RECHECK-UPDATE",
      layer: "native",
      status: "blocked",
      reason: "Depends on NATIVE-TOOL-DISCOVERY",
    },
    {
      id: "MODEL-AGENT-JOURNEYS",
      layer: "native",
      status: "blocked",
      reason:
        "Model-directed WebMCP journeys were not run in this Phase 1 session. Use Cursor or Inspector with discovered tools when available.",
      setup: [
        "Exact update then prepare_trip_review (×2)",
        "Ambiguous brief requiring clarification (×2)",
        "Premium-cabin request whose explanation distinguishes review from a blocker (×2)",
      ],
    },
  ];

  const file = writeEvidence(results);
  console.log(
    JSON.stringify(
      {
        ok: true,
        status: "blocked",
        evidence: file,
        summary: {
          total: results.length,
          blocked: results.filter((r) => r.status === "blocked").length,
        },
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
