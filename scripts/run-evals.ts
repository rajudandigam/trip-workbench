import "./load-env.js";
import fs from "node:fs";
import path from "node:path";
import { startTestApp, login, authedJson } from "../tests/api/helpers.js";

type SeedCase = {
  id: string;
  title?: string;
  tags?: string[];
  kind?: string;
  layer?: string;
  prompt?: string;
};

/**
 * Translates harness-neutral cases into executable deterministic checks where possible.
 * Native browser / live-model cases are labeled blocked or not_run with reasons.
 */
async function main() {
  const seedPath = path.resolve("evals/cases.seed.json");
  const seed = JSON.parse(fs.readFileSync(seedPath, "utf8")) as { cases?: SeedCase[] };
  const cases = seed.cases || [];
  const outDir = path.resolve("evals/evidence");
  fs.mkdirSync(outDir, { recursive: true });

  const results: Array<Record<string, unknown>> = [];
  const app = await startTestApp();
  try {
    for (const c of cases) {
      const layer = (c.layer || "").toLowerCase();
      const id = c.id.toUpperCase();

      if (
        layer.includes("native_model") ||
        layer.includes("native_deterministic") ||
        id.startsWith("MODEL-") ||
        id.startsWith("WEBMCP-") ||
        id.includes("TOOL-CONTEXT") ||
        id.includes("LIFECYCLE")
      ) {
        results.push({
          id: c.id,
          status: "blocked",
          reason:
            "Requires Chrome document.modelContext and/or a login-capable native browser eval harness",
        });
        continue;
      }

      if (id.includes("SUMMAR") || layer.includes("optional_local_ai") || id.startsWith("LOCAL-")) {
        results.push({
          id: c.id,
          status: "blocked",
          reason: "On-device Summarizer API not present in this Node eval host",
        });
        continue;
      }

      try {
        const alex = await login(app.baseUrl, "alex@northstar.demo");

        if (
          id.includes("OBSERVER") ||
          id.includes("PERMISSION") ||
          id.includes("AUTHZ") ||
          id.includes("ACCESS-BOUNDARY")
        ) {
          const created = await authedJson(app.baseUrl, alex.cookie, alex.csrfToken, "/api/trips", {
            method: "POST",
            body: JSON.stringify({ commandId: `eval-${c.id}-create` }),
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
                commandId: `eval-${c.id}-patch`,
                patch: { purpose: "x" },
              }),
            },
          );
          results.push({
            id: c.id,
            status: mutate.status === 403 ? "pass" : "fail",
            httpStatus: mutate.status,
          });
          continue;
        }

        if (id.includes("TENANT") || id.includes("CROSS")) {
          const created = await authedJson(app.baseUrl, alex.cookie, alex.csrfToken, "/api/trips", {
            method: "POST",
            body: JSON.stringify({ commandId: `eval-${c.id}-create` }),
          });
          const tripId = String(created.body.data?.tripId);
          const casey = await login(app.baseUrl, "casey@cedar.demo");
          const cross = await authedJson(
            app.baseUrl,
            casey.cookie,
            casey.csrfToken,
            `/api/trips/${tripId}`,
          );
          results.push({
            id: c.id,
            status: cross.status === 404 ? "pass" : "fail",
            httpStatus: cross.status,
          });
          continue;
        }

        if (
          id.includes("PROPOSAL") ||
          id.includes("FIXTURE") ||
          id.includes("GEMINI") ||
          id.includes("AI-") ||
          id.includes("EXACT") ||
          id.includes("AMBIG")
        ) {
          const created = await authedJson(app.baseUrl, alex.cookie, alex.csrfToken, "/api/trips", {
            method: "POST",
            body: JSON.stringify({ commandId: `eval-${c.id}-create` }),
          });
          const tripId = String(created.body.data?.tripId);
          const brief =
            c.prompt ||
            "Prepare a round trip from SFO to JFK, departing November 12, 2026 and returning November 15, 2026, for one traveler in economy. Purpose: customer workshop.";
          const proposal = await authedJson(
            app.baseUrl,
            alex.cookie,
            alex.csrfToken,
            `/api/trips/${tripId}/proposal`,
            {
              method: "POST",
              body: JSON.stringify({
                brief,
                expectedRevision: 1,
                clientEditVersion: 0,
                briefVersion: 1,
              }),
            },
          );
          const body = proposal.body as {
            ok?: boolean;
            data?: { mode?: string; proposal?: { patch?: { destination?: string }; clarifications?: unknown[] } };
          };
          const wantsAmbiguous = brief.toLowerCase().includes("springfield");
          const ok = wantsAmbiguous
            ? Boolean(body.ok && (body.data?.proposal?.clarifications?.length || 0) > 0)
            : Boolean(body.ok && body.data?.proposal?.patch?.destination === "JFK");
          results.push({
            id: c.id,
            status: ok ? "pass" : "fail",
            mode: body.data?.mode,
          });
          continue;
        }

        if (
          id.includes("SUBMIT") ||
          id.includes("PERSIST") ||
          id.includes("REVISION") ||
          id.includes("IDEMPOT") ||
          layer.includes("deterministic") ||
          layer.includes("api")
        ) {
          const created = await authedJson(app.baseUrl, alex.cookie, alex.csrfToken, "/api/trips", {
            method: "POST",
            body: JSON.stringify({ commandId: `eval-${c.id}-create` }),
          });
          const tripId = String(created.body.data?.tripId);
          const patched = await authedJson(app.baseUrl, alex.cookie, alex.csrfToken, `/api/trips/${tripId}`, {
            method: "PATCH",
            body: JSON.stringify({
              expectedRevision: 1,
              commandId: `eval-${c.id}-patch`,
              patch: {
                destination: "JFK",
                departureDate: "2026-11-12",
                returnDate: "2026-11-15",
                purpose: "customer workshop",
              },
            }),
          });
          const replay = await authedJson(app.baseUrl, alex.cookie, alex.csrfToken, `/api/trips/${tripId}`, {
            method: "PATCH",
            body: JSON.stringify({
              expectedRevision: 1,
              commandId: `eval-${c.id}-patch`,
              patch: {
                destination: "JFK",
                departureDate: "2026-11-12",
                returnDate: "2026-11-15",
                purpose: "customer workshop",
              },
            }),
          });
          results.push({
            id: c.id,
            status: patched.body.ok && replay.body.ok && replay.body.data?.toRevision === 2 ? "pass" : "fail",
          });
          continue;
        }

        results.push({
          id: c.id,
          status: "not_run",
          reason: `No deterministic mapping for layer=${c.layer || "unknown"}`,
        });
      } catch (error) {
        results.push({
          id: c.id,
          status: "fail",
          reason: (error as Error).message,
        });
      }
    }
  } finally {
    await app.close();
  }

  const summary = {
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
