/**
 * API-labeled receipt-readback evidence journey.
 *
 * Honest scope: authorized HTTP PATCH + command-receipt GET + SQL row read.
 * This is not a native WebMCP proof and does not claim browser response-drop,
 * local-buffer preservation, or UI success.
 *
 * Alias: historically referred to as "lost-response-evidence" in npm scripts.
 * Execution label: api
 */
import "../load-env.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createInspector } from "agent-inspect";
import { bufferedFileWriter } from "agent-inspect/writers";
import { pathToFileURL } from "node:url";
import {
  completedFromActual,
  evaluateTripEffectChecks,
} from "./effect-checks.js";

/** Declared before execution — never copied from the returned receipt. */
const EXPECTED_ACTION = "update" as const;
const EXPECTED_OUTCOMES = ["applied"] as const;

async function main() {
  const { startTestApp, login, authedJson } = await import(
    pathToFileURL(path.resolve("tests/api/helpers.ts")).href
  );

  const outRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tw-receipt-readback-"));
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

    const commandId = "evidence-receipt-readback";
    // Independent expectation — declared before the mutating call.
    const expectation = {
      domain: "trip" as const,
      intendedResourceId: tripId,
      commandId,
      action: EXPECTED_ACTION,
      expectedOutcomes: EXPECTED_OUTCOMES,
      expectedFromRevision: 2,
      expectedToRevision: 3,
      expectedFields: { destination: "BOS" },
      // API journey: no browser local buffer claimed.
      requiredObservations: [
        "target_resource_matches",
        "original_command_receipt_matches",
        "requested_change_observed",
        "revision_semantics_match",
        "no_unintended_submission",
      ] as const,
    };

    const result = await inspector.run("receipt-readback", async () => {
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
        {
          type: "tool",
          metadata: {
            domain: "trip",
            operation: "update",
            execution: "api",
            journey: "receipt-readback",
          },
        },
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
        {
          type: "tool",
          metadata: {
            domain: "trip",
            operation: "command_receipt_read",
            execution: "api",
          },
        },
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

      const actual = {
        observedResourceId: row.id,
        receipt: {
          commandId: receipt.commandId,
          action: receipt.action,
          outcome: receipt.outcome,
          tripId: receipt.tripId,
          fromRevision: receipt.fromRevision,
          toRevision: receipt.toRevision,
        },
        savedRevision: row.revision,
        savedFields: { destination: row.destination, purpose: row.purpose },
        submissions: Number(row.submissions),
        localObserved: false,
      };
      const completedObservations = completedFromActual(actual);
      const observations = evaluateTripEffectChecks(expectation, {
        ...actual,
        completedObservations,
      });

      // Record only required API facts. Do not emit optional unknown
      // local_edits_preserved — that would falsely fail --fail-on unknown while
      // inventing a browser claim this journey does not make.
      const required = new Set<string>(expectation.requiredObservations);
      for (const obs of observations) {
        if (!required.has(obs.name)) continue;
        await inspector.observeOutcome(obs.name, {
          expectation: obs.name,
          status: obs.verdict,
          method: obs.method,
          evidence: {
            ...obs.evidence,
            execution: "api",
            journey: "receipt-readback",
            ...(obs.reason ? { reason: obs.reason } : {}),
          },
        });
      }

      return { observations, receipt, row, expectation };
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

    const requiredPassed = result.observations
      .filter((o) => o.name !== "local_edits_preserved")
      .every((o) => o.verdict === "passed");

    const report = {
      ok: check.status === 0 && verify.status === 0 && requiredPassed,
      execution: "api",
      journey: "receipt-readback",
      aliasOf: "lost-response-evidence",
      native: "not_run",
      ui: "not_claimed",
      note:
        "API receipt-readback only. Does not claim native WebMCP, response-drop, local-buffer preservation, or UI success.",
      declaredAction: EXPECTED_ACTION,
      declaredOutcomes: EXPECTED_OUTCOMES,
      traceFile,
      checkExit: check.status,
      checkStdout: check.stdout?.slice(0, 2000),
      verifyExit: verify.status,
      verifyStdout: verify.stdout?.slice(0, 1000),
      observations: result.observations,
      outRoot,
      evidenceDir,
    };
    const reportPath = path.join(outRoot, "receipt-readback-report.json");
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
