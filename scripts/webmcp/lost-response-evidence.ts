/**
 * API-labeled lost-response / receipt-recovery evidence journey.
 *
 * This is not a native WebMCP proof. It exercises Trip's authorized APIs plus
 * AgentInspect observeOutcome / check / Evidence v2 on a disposable test DB.
 *
 * Execution label: api
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createInspector } from "agent-inspect";
import { bufferedFileWriter } from "agent-inspect/writers";
import { pathToFileURL } from "node:url";
import { evaluateTripEffectChecks } from "./effect-checks.js";

async function main() {
  const { startTestApp, login, authedJson } = await import(
    pathToFileURL(path.resolve("tests/api/helpers.ts")).href
  );

  const outRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tw-lost-response-"));
  const traceDir = path.join(outRoot, "traces");
  fs.mkdirSync(traceDir, { recursive: true });

  process.env.AI_MODE = process.env.AI_MODE || "fixture";
  const app = await startTestApp();
  const writer = bufferedFileWriter({ dir: traceDir, flushIntervalMs: 50 });
  const inspector = createInspector({
    enabled: true,
    writer,
    traceDir,
    silent: true,
    capture: { onSuccess: "none", onError: "none" },
  });

  try {
    const alex = await login(app.baseUrl, "alex@northstar.demo");
    const created = await authedJson(app.baseUrl, alex.cookie, alex.csrfToken, "/api/trips", {
      method: "POST",
      body: JSON.stringify({ commandId: "evidence-create" }),
    });
    const tripId = String(created.body.data?.tripId);

    await authedJson(app.baseUrl, alex.cookie, alex.csrfToken, `/api/trips/${tripId}`, {
      method: "PATCH",
      body: JSON.stringify({
        expectedRevision: 1,
        commandId: "evidence-setup",
        patch: {
          destination: "JFK",
          departureDate: "2026-11-12",
          returnDate: "2026-11-15",
          purpose: "Customer workshop",
          cabin: "business",
        },
      }),
    });

    const commandId = "evidence-lost-response";
    const result = await inspector.run("lost-response-recovery", async () => {
      // Server commits the update (API path). A native runner would drop the
      // HTTP response here; this API journey records the committed write, then
      // independently reads the receipt and saved row.
      const patched = await inspector.step(
        "update_trip_draft",
        async () =>
          authedJson(app.baseUrl, alex.cookie, alex.csrfToken, `/api/trips/${tripId}`, {
            method: "PATCH",
            body: JSON.stringify({
              expectedRevision: 2,
              commandId,
              patch: { destination: "BOS" },
            }),
          }),
        { type: "tool", metadata: { domain: "trip", operation: "update", execution: "api" } },
      );
      if (!patched.body.ok) {
        throw new Error(`patch failed: ${JSON.stringify(patched.body.error)}`);
      }

      const receiptRes = await inspector.step(
        "read_command_receipt",
        async () =>
          authedJson(
            app.baseUrl,
            alex.cookie,
            alex.csrfToken,
            `/api/trips/${tripId}/commands/${commandId}`,
          ),
        { type: "tool", metadata: { domain: "trip", operation: "command_receipt_read" } },
      );

      const row = (
        await app.db.query(
          `SELECT id, revision, status, destination, purpose,
                  (SELECT count(*)::int FROM trip_submissions WHERE trip_id = $1) AS submissions
           FROM trip_drafts WHERE id = $1`,
          [tripId],
        )
      ).rows[0] as {
        id: string;
        revision: number;
        status: string;
        destination: string;
        purpose: string;
        submissions: number;
      };

      const receipt = receiptRes.body.data as {
        commandId: string;
        action: string;
        outcome: string;
        fromRevision: number | null;
        toRevision: number | null;
        tripId: string;
      };

      // Simulate preserved local edit distinct from saved purpose.
      const localPurpose = "Human edit after unknown outcome";
      const observations = evaluateTripEffectChecks(
        {
          domain: "trip",
          intendedResourceId: tripId,
          commandId,
          action: receipt.action,
          expectedFromRevision: 2,
          expectedToRevision: 3,
          expectedFields: { destination: "BOS" },
        },
        {
          observedResourceId: row.id,
          receipt: {
            commandId: receipt.commandId,
            action: receipt.action,
            outcome: receipt.outcome,
            fromRevision: receipt.fromRevision,
            toRevision: receipt.toRevision,
          },
          savedFields: { destination: row.destination, purpose: row.purpose },
          localFields: { purpose: localPurpose },
          submissions: Number(row.submissions),
          captureComplete: true,
        },
      );

      for (const obs of observations) {
        await inspector.observeOutcome(obs.name, {
          expectation: obs.name,
          status: obs.verdict,
          method: "database",
          evidence: { ...obs.evidence, execution: "api", ...(obs.reason ? { reason: obs.reason } : {}) },
        });
      }

      return { observations, receipt, row };
    });

    await inspector.flush();
    await inspector.close();

    const files = fs.readdirSync(traceDir).filter((n) => n.endsWith(".jsonl"));
    if (files.length !== 1) {
      throw new Error(`expected one trace file, found ${files.length}`);
    }
    const traceFile = path.join(traceDir, files[0]!);

    const evidenceDir = path.join(outRoot, "evidence");
    fs.mkdirSync(evidenceDir, { recursive: true });
    const check = spawnSync(
      process.execPath,
      [
        path.resolve("node_modules/agent-inspect/packages/cli/dist/index.cjs"),
        "check",
        traceFile,
        "--required-tool",
        "update_trip_draft",
        "--fail-on-observation",
        "failed,unknown,skipped",
        "--evidence-on",
        "always",
        "--evidence-dir",
        evidenceDir,
        "--evidence-format",
        "directory",
        "--json",
      ],
      { encoding: "utf8" },
    );

    const verify = spawnSync(
      process.execPath,
      [
        path.resolve("node_modules/agent-inspect/packages/cli/dist/index.cjs"),
        "bundle",
        "verify",
        evidenceDir,
      ],
      { encoding: "utf8" },
    );

    const report = {
      ok:
        check.status === 0 &&
        verify.status === 0 &&
        result.observations.every((o) => o.verdict === "passed"),
      execution: "api",
      native: "not_run",
      note: "API-labeled journey. Native WebMCP execution remains blocked/not established on this host.",
      traceFile,
      checkExit: check.status,
      checkStdout: check.stdout?.slice(0, 2000),
      verifyExit: verify.status,
      verifyStdout: verify.stdout?.slice(0, 1000),
      observations: result.observations,
      outRoot,
      evidenceDir,
    };
    const reportPath = path.join(outRoot, "lost-response-report.json");
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ ...report, reportPath }, null, 2));
    process.exitCode = report.ok ? 0 : 1;
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
