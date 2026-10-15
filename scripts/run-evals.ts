import "./load-env.js";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { startTestApp, login, authedJson } from "../tests/api/helpers.js";
import { parseTripPatch } from "../src/domain/trip-schemas.js";
import type { TripFields } from "../src/domain/types.js";

type CaseResult = {
  id: string;
  layer: string;
  status: "pass" | "fail" | "blocked" | "not_run";
  assertions?: string[];
  reason?: string;
  evidence?: string;
};

function runVitestFilter(filter: string): boolean {
  const result = spawnSync(
    "npx",
    ["vitest", "run", "--config", "vitest.config.ts", "tests/unit", "-t", filter],
    { encoding: "utf8" },
  );
  return result.status === 0;
}

async function main() {
  const seed = JSON.parse(fs.readFileSync("evals/cases.seed.json", "utf8")) as {
    cases: Array<{ id: string }>;
  };
  const caseIds = seed.cases.map((c) => c.id);
  const outDir = path.resolve("evals/evidence");
  fs.mkdirSync(outDir, { recursive: true });

  const app = await startTestApp();
  const results: CaseResult[] = [];

  type ApiRunner = () => Promise<CaseResult>;
  const apiRegistry: Record<string, ApiRunner> = {
    "INPUT-CROSS-FIELD": async () => {
      const alex = await login(app.baseUrl, "alex@northstar.demo");
      const created = await authedJson(app.baseUrl, alex.cookie, alex.csrfToken, "/api/trips", {
        method: "POST",
        body: JSON.stringify({ commandId: "eval-cross-create" }),
      });
      const tripId = String(created.body.data?.tripId);
      const before = await authedJson(app.baseUrl, alex.cookie, alex.csrfToken, `/api/trips/${tripId}`);
      const bad = await authedJson(app.baseUrl, alex.cookie, alex.csrfToken, `/api/trips/${tripId}`, {
        method: "PATCH",
        body: JSON.stringify({
          expectedRevision: 1,
          commandId: "eval-cross-patch",
          patch: { destination: "SFO" },
        }),
      });
      const after = await authedJson(app.baseUrl, alex.cookie, alex.csrfToken, `/api/trips/${tripId}`);
      const ok =
        bad.status === 422 &&
        after.body.data?.revision === before.body.data?.revision &&
        (after.body.data?.fields as TripFields | undefined)?.destination == null;
      return {
        id: "INPUT-CROSS-FIELD",
        layer: "api_db",
        status: ok ? "pass" : "fail",
        assertions: ["422 on same-airport patch", "revision unchanged", "destination unchanged"],
      };
    },
    "INPUT-SHAPE": async () => {
      const alex = await login(app.baseUrl, "alex@northstar.demo");
      const created = await authedJson(app.baseUrl, alex.cookie, alex.csrfToken, "/api/trips", {
        method: "POST",
        body: JSON.stringify({ commandId: "eval-shape-create" }),
      });
      const tripId = String(created.body.data?.tripId);
      const bad = await authedJson(app.baseUrl, alex.cookie, alex.csrfToken, `/api/trips/${tripId}`, {
        method: "PATCH",
        body: JSON.stringify({
          expectedRevision: 1,
          commandId: "eval-shape-patch",
          patch: { purpose: 42 },
        }),
      });
      const schema = parseTripPatch({ purpose: 42 });
      return {
        id: "INPUT-SHAPE",
        layer: "api_db",
        status: bad.status === 422 && !schema.ok ? "pass" : "fail",
        assertions: ["purpose:42 rejected"],
      };
    },
    "ACCESS-BOUNDARY": async () => {
      const alex = await login(app.baseUrl, "alex@northstar.demo");
      const created = await authedJson(app.baseUrl, alex.cookie, alex.csrfToken, "/api/trips", {
        method: "POST",
        body: JSON.stringify({ commandId: "eval-access-create" }),
      });
      const tripId = String(created.body.data?.tripId);
      const observer = await login(app.baseUrl, "observer@northstar.demo");
      const mutate = await authedJson(
        app.baseUrl,
        observer.cookie,
        observer.csrfToken,
        `/api/trips/${tripId}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            expectedRevision: 1,
            commandId: "eval-access-patch",
            patch: { purpose: "nope" },
          }),
        },
      );
      const casey = await login(app.baseUrl, "casey@cedar.demo");
      const cross = await authedJson(app.baseUrl, casey.cookie, casey.csrfToken, `/api/trips/${tripId}`);
      return {
        id: "ACCESS-BOUNDARY",
        layer: "api_db",
        status: mutate.status === 403 && cross.status === 404 ? "pass" : "fail",
        assertions: ["observer 403", "cross-tenant 404"],
      };
    },
    "IDEMPOTENT-RETRY": async () => {
      const alex = await login(app.baseUrl, "alex@northstar.demo");
      const created = await authedJson(app.baseUrl, alex.cookie, alex.csrfToken, "/api/trips", {
        method: "POST",
        body: JSON.stringify({ commandId: "eval-idem-create" }),
      });
      const tripId = String(created.body.data?.tripId);
      const body = {
        expectedRevision: 1,
        commandId: "eval-idem-patch",
        patch: { destination: "JFK", purpose: "customer workshop" },
      };
      const first = await authedJson(app.baseUrl, alex.cookie, alex.csrfToken, `/api/trips/${tripId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      const second = await authedJson(app.baseUrl, alex.cookie, alex.csrfToken, `/api/trips/${tripId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      return {
        id: "IDEMPOTENT-RETRY",
        layer: "api_db",
        status: first.body.ok && second.body.ok && second.body.data?.toRevision === 2 ? "pass" : "fail",
        assertions: ["exact retry returns same toRevision"],
      };
    },
    "AI-REVIEW-APPLY": async () => {
      const alex = await login(app.baseUrl, "alex@northstar.demo");
      const created = await authedJson(app.baseUrl, alex.cookie, alex.csrfToken, "/api/trips", {
        method: "POST",
        body: JSON.stringify({ commandId: "eval-ai-create" }),
      });
      const tripId = String(created.body.data?.tripId);
      const proposal = await authedJson(
        app.baseUrl,
        alex.cookie,
        alex.csrfToken,
        `/api/trips/${tripId}/proposal`,
        {
          method: "POST",
          body: JSON.stringify({
            brief:
              "Prepare a round trip from SFO to JFK, departing November 12, 2026 and returning November 15, 2026, for one traveler in economy. Purpose: customer workshop.",
            expectedRevision: 1,
            clientEditVersion: 0,
            briefVersion: 1,
          }),
        },
      );
      const patch = (proposal.body.data as { proposal?: { patch?: TripFields } } | undefined)?.proposal
        ?.patch;
      const applied = await authedJson(app.baseUrl, alex.cookie, alex.csrfToken, `/api/trips/${tripId}`, {
        method: "PATCH",
        body: JSON.stringify({ expectedRevision: 1, commandId: "eval-ai-apply", patch }),
      });
      const after = await authedJson(app.baseUrl, alex.cookie, alex.csrfToken, `/api/trips/${tripId}`);
      const fields = after.body.data?.fields as TripFields | undefined;
      const ok =
        Boolean(proposal.body.ok) &&
        Boolean(applied.body.ok) &&
        fields?.destination === "JFK" &&
        fields?.purpose === "customer workshop" &&
        after.body.data?.revision === 2;
      return {
        id: "AI-REVIEW-APPLY",
        layer: "api_db",
        status: ok ? "pass" : "fail",
        assertions: ["fixture proposal applied to saved state"],
      };
    },
    "DATE-CALENDAR": async () => {
      const alex = await login(app.baseUrl, "alex@northstar.demo");
      const created = await authedJson(app.baseUrl, alex.cookie, alex.csrfToken, "/api/trips", {
        method: "POST",
        body: JSON.stringify({ commandId: "eval-date-create" }),
      });
      const tripId = String(created.body.data?.tripId);
      const bad = await authedJson(app.baseUrl, alex.cookie, alex.csrfToken, `/api/trips/${tripId}`, {
        method: "PATCH",
        body: JSON.stringify({
          expectedRevision: 1,
          commandId: "eval-date-patch",
          patch: { departureDate: "2026-02-30" },
        }),
      });
      return {
        id: "DATE-CALENDAR",
        layer: "api_db",
        status: bad.status === 422 ? "pass" : "fail",
        assertions: ["2026-02-30 rejected"],
      };
    },
    "DRAFT-PARTIAL": async () => {
      const alex = await login(app.baseUrl, "alex@northstar.demo");
      const created = await authedJson(app.baseUrl, alex.cookie, alex.csrfToken, "/api/trips", {
        method: "POST",
        body: JSON.stringify({ commandId: "eval-partial-create" }),
      });
      const tripId = String(created.body.data?.tripId);
      const patched = await authedJson(app.baseUrl, alex.cookie, alex.csrfToken, `/api/trips/${tripId}`, {
        method: "PATCH",
        body: JSON.stringify({
          expectedRevision: 1,
          commandId: "eval-partial-patch",
          patch: { destination: "JFK" },
        }),
      });
      return {
        id: "DRAFT-PARTIAL",
        layer: "api_db",
        status: patched.body.ok && patched.body.data?.toRevision === 2 ? "pass" : "fail",
        assertions: ["destination-only patch saved"],
      };
    },
  };

  const adapterRegistry: Record<string, { filter: string; assertions: string[] }> = {
    "RACE-INFLIGHT": {
      filter: "preserves human edits made during an agent update",
      assertions: ["saved/local field merge during flight"],
    },
    "CANCEL-PREDISPATCH": {
      filter: "pre-aborted agent update sends zero PATCH",
      assertions: ["CANCELLED", "zero PATCH"],
    },
    "CANCEL-POSTDISPATCH": {
      filter: "reconciles via command receipt after network loss",
      assertions: ["OUTCOME_UNKNOWN then receipt recovery"],
    },
    "IDEMPOTENT-OLD-RECEIPT": {
      filter: "does not regress UI when a historical receipt arrives",
      assertions: ["UI revision does not regress"],
    },
    "RACE-PROPOSAL": {
      filter: "marks Gemini proposal stale after local edits",
      assertions: ["proposal stale after local edit"],
    },
  };

  const blockedNative = new Set([
    "MODEL-EXACT",
    "MODEL-AMBIGUOUS",
    "MODEL-PURCHASE",
    "WEBMCP-UNSUPPORTED",
    "TOOL-CONTEXT",
    "LIFECYCLE",
    "RACE-UNSAVED",
    "RACE-CAS",
  ]);
  const blockedLocalAi = new Set(["LOCAL-CONSENT", "LOCAL-LATE-CREATE"]);

  try {
    for (const id of caseIds) {
      if (apiRegistry[id]) {
        try {
          results.push(await apiRegistry[id]());
        } catch (error) {
          results.push({
            id,
            layer: "api_db",
            status: "fail",
            reason: (error as Error).message,
          });
        }
        continue;
      }
      if (adapterRegistry[id]) {
        const entry = adapterRegistry[id];
        const ok = runVitestFilter(entry.filter);
        results.push({
          id,
          layer: "adapter",
          status: ok ? "pass" : "fail",
          assertions: entry.assertions,
          evidence: "vitest controlled substitute (not native WebMCP)",
        });
        continue;
      }
      if (blockedNative.has(id)) {
        results.push({
          id,
          layer: "native",
          status: "blocked",
          reason:
            "Requires Chrome document.modelContext and/or model-driven browser evaluation — unverified",
        });
        continue;
      }
      if (blockedLocalAi.has(id)) {
        results.push({
          id,
          layer: "optional_local_ai",
          status: "blocked",
          reason: "On-device Summarizer not available in this Node host — unverified",
        });
        continue;
      }
      results.push({
        id,
        layer: "unmapped",
        status: "not_run",
        reason: "No exact case-ID runner implemented",
      });
    }
  } finally {
    await app.close();
  }

  const summary = {
    supersededEvidenceNote:
      "Earlier eval-summary claiming 18 passes used inaccurate substring mappings and is not proof.",
    total: results.length,
    pass: results.filter((r) => r.status === "pass").length,
    fail: results.filter((r) => r.status === "fail").length,
    blocked: results.filter((r) => r.status === "blocked").length,
    not_run: results.filter((r) => r.status === "not_run").length,
    results,
  };
  const outFile = path.join(
    outDir,
    `eval-summary-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
  );
  fs.writeFileSync(outFile, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({ ok: summary.fail === 0, outFile, summary }, null, 2));
  if (summary.fail > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
