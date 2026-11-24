import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createInspector } from "agent-inspect";
import { bufferedFileWriter } from "agent-inspect/writers";
import {
  UI_SYNC_SEED_RUN_ID,
  combineUiSyncExit,
  evaluateEvidenceGate,
  findPersistedOutcome,
  locateOwnedTrace,
  locateWrittenTraceByMtime,
  operationVerdictFromPhases,
  readPersistedOutcomes,
  resolveTraceForRun,
  runIdForCase,
  runPersistedCliEvidence,
  scoreCaseAbc,
  scoreLaneAFinalDom,
  scoreLaneBPerOp,
  scoreLaneCFromPersisted,
} from "../../scripts/webmcp/ui-sync-comparison.js";
import type { SyncFact } from "../../scripts/webmcp/ui-sync-observer.js";

function fact(
  name: string,
  verdict: SyncFact["verdict"],
  phase: SyncFact["phase"] = "operation_deadline",
): SyncFact {
  return {
    name,
    verdict,
    method: "dom",
    phase,
    evidence: {},
  };
}

describe("ui-sync A/B/C comparison", () => {
  it("lane A scores synthetic controls as not_scored (not a credited pass)", () => {
    expect(
      scoreLaneAFinalDom({
        caseId: "healthy-update",
        fixtureStatus: "pass",
        finalDomFields: { destination: "BOS" },
        expectedFinalDomFields: { destination: "BOS" },
      }).verdict,
    ).toBe("pass");

    expect(
      scoreLaneAFinalDom({
        caseId: "missing-observer",
        fixtureStatus: "pass",
        expectedFinalDomFields: null,
      }).verdict,
    ).toBe("not_scored");

    expect(
      scoreLaneAFinalDom({
        caseId: "wrong-resource",
        fixtureStatus: "pass",
        expectedFinalDomFields: null,
      }).verdict,
    ).toBe("not_scored");
  });

  it("lane B detects injected mismatch at deadline even when final DOM later matches", () => {
    const deadlineFacts = [
      fact("ui_matches_saved", "failed"),
      fact("saved_fields_match", "passed"),
    ];
    const repairFacts = [
      fact("ui_matches_saved", "passed", "after_repair"),
      fact("saved_fields_match", "passed", "after_repair"),
    ];
    const scored = scoreLaneBPerOp({
      caseId: "stale-ui-then-repair",
      fixtureStatus: "pass",
      deadlineFacts,
      repairFacts,
    });
    expect(scored.verdict).toBe("pass");
  });

  it("lane C requires earlier deadline failure still present after repair", () => {
    const outcomes = [
      { name: "stale.deadline.ui_matches_saved", status: "failed" as const },
      { name: "stale.repair.ui_matches_saved", status: "passed" as const },
    ];
    expect(
      scoreLaneCFromPersisted({
        caseId: "stale-ui-then-repair",
        fixtureStatus: "pass",
        outcomes,
        evidenceVerified: true,
        evidenceOk: true,
      }).verdict,
    ).toBe("pass");

    expect(
      scoreLaneCFromPersisted({
        caseId: "stale-ui-then-repair",
        fixtureStatus: "pass",
        outcomes: [
          { name: "stale.repair.ui_matches_saved", status: "passed" },
        ],
        evidenceVerified: true,
        evidenceOk: null,
      }).verdict,
    ).toBe("fail");
  });

  it("operationVerdict is not derived from fixtureStatus", () => {
    // Negative control fixture pass ≠ app mutation met.
    expect(
      operationVerdictFromPhases({
        caseId: "missing-observer",
        fixtureStatus: "pass",
        deadlineFacts: [fact("ui_fields_match", "unknown")],
      }),
    ).toBe("unknown");

    expect(
      operationVerdictFromPhases({
        caseId: "dirty-refusal",
        fixtureStatus: "pass",
        deadlineFacts: [
          fact("mutation_refused", "passed"),
          fact("no_write", "passed"),
        ],
      }),
    ).toBe("refused");

    expect(
      operationVerdictFromPhases({
        caseId: "wrong-resource",
        fixtureStatus: "pass",
        deadlineFacts: [fact("resource_binding", "failed")],
      }),
    ).toBe("unmet");
  });

  it("missing artifact → lane C nonpass and evidenceVerified false", () => {
    const report = scoreCaseAbc({
      caseId: "healthy-update",
      fixtureStatus: "pass",
      outcomes: [],
      evidenceVerified: null,
      missingArtifact: true,
      finalDomFields: { destination: "BOS" },
      expectedFinalDomFields: { destination: "BOS" },
      deadlineFacts: [fact("ui_fields_match", "passed")],
    });
    expect(report.evidenceVerified).toBe(false);
    expect(report.evidenceOk).toBe(false);
    expect(report.lanes.C.verdict).toBe("fail");
    expect(report.runId).toBe(runIdForCase("healthy-update"));
  });

  it("not_run fixtures leave all lanes not_scored", () => {
    const report = scoreCaseAbc({
      caseId: "healthy-update",
      fixtureStatus: "not_run",
      outcomes: [],
      evidenceVerified: null,
    });
    expect(report.operationVerdict).toBe("not_scored");
    expect(report.evidenceVerified).toBeNull();
    expect(report.lanes.A.verdict).toBe("not_scored");
    expect(report.lanes.B.verdict).toBe("not_scored");
    expect(report.lanes.C.verdict).toBe("not_scored");
  });

  it("combineUiSyncExit fails when evidence gate fails even if matrix ok", () => {
    const combined = combineUiSyncExit({
      matrixExitCode: 0,
      matrixOk: true,
      caseEvidence: [
        { caseId: "healthy-update", evidenceOk: true },
        { caseId: "stale-ui-then-repair", evidenceOk: false },
      ],
    });
    expect(combined.ok).toBe(false);
    expect(combined.exitCode).toBe(1);
    expect(combined.evidenceFailed).toEqual(["stale-ui-then-repair"]);
  });

  it("readPersistedOutcomes parses OUTCOME statuses from JSONL", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tw-abc-trace-"));
    const file = path.join(dir, "t.jsonl");
    fs.writeFileSync(
      file,
      [
        JSON.stringify({
          kind: "OUTCOME",
          name: "stale.deadline.ui_matches_saved",
          attributes: { outcomeStatus: "failed" },
        }),
        JSON.stringify({ kind: "STEP", name: "update_trip_draft" }),
        JSON.stringify({
          kind: "OUTCOME",
          name: "stale.repair.ui_fields_match",
          attributes: { outcomeStatus: "passed" },
        }),
      ].join("\n") + "\n",
    );
    const outcomes = readPersistedOutcomes(file);
    expect(outcomes).toHaveLength(2);
    expect(findPersistedOutcome(outcomes, "stale.deadline.ui_matches_saved")).toBe(
      "failed",
    );
  });

  it("runPersistedCliEvidence reports missingArtifact for absent owned runId", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tw-abc-empty-"));
    const result = runPersistedCliEvidence({
      traceDir: path.join(dir, "traces-missing"),
      runId: runIdForCase("healthy-update"),
      evidenceDir: path.join(dir, "evidence"),
    });
    expect(result.missingArtifact).toBe(true);
    expect(result.traceFile).toBeNull();
    expect(evaluateEvidenceGate("healthy-update", result).ok).toBe(false);
  });
});

describe("ui-sync case/run/artifact ownership (published writer)", () => {
  it("resolves each case to its own runId file; mtime reorder does not steal ownership", async () => {
    const traceDir = fs.mkdtempSync(path.join(os.tmpdir(), "tw-own-"));
    const writer = bufferedFileWriter({ dir: traceDir, flushIntervalMs: 20 });
    const inspector = createInspector({
      enabled: true,
      writer,
      traceDir,
      silent: true,
      capture: { onSuccess: "none", onError: "none" },
    });

    const seedId = UI_SYNC_SEED_RUN_ID;
    const healthyId = runIdForCase("healthy-update");
    const staleId = runIdForCase("stale-ui-then-repair");

    await inspector.run(
      "seed",
      async () => {
        await inspector.observeOutcome("seed.marker", {
          expectation: "seed",
          status: "passed",
          method: "custom",
          evidence: { role: "seed" },
        });
      },
      { runId: seedId },
    );

    await inspector.run(
      "healthy",
      async () => {
        await inspector.observeOutcome("healthy.deadline.ui_fields_match", {
          expectation: "ui_fields_match",
          status: "passed",
          method: "dom",
          evidence: {},
        });
        await inspector.observeOutcome("healthy.deadline.saved_fields_match", {
          expectation: "saved_fields_match",
          status: "passed",
          method: "database",
          evidence: {},
        });
      },
      { runId: healthyId },
    );

    await inspector.run(
      "stale",
      async () => {
        await inspector.observeOutcome("stale.deadline.ui_matches_saved", {
          expectation: "ui_matches_saved",
          status: "failed",
          method: "dom",
          evidence: {},
        });
        await inspector.observeOutcome("stale.repair.ui_matches_saved", {
          expectation: "ui_matches_saved",
          status: "passed",
          method: "dom",
          evidence: {},
        });
      },
      { runId: staleId },
    );

    await inspector.flush();
    await inspector.close();

    const seedPath = resolveTraceForRun(traceDir, seedId);
    const healthyPath = resolveTraceForRun(traceDir, healthyId);
    const stalePath = resolveTraceForRun(traceDir, staleId);
    expect(fs.existsSync(seedPath)).toBe(true);
    expect(fs.existsSync(healthyPath)).toBe(true);
    expect(fs.existsSync(stalePath)).toBe(true);

    // Prove mtime selection is wrong after reordering — seed becomes "newest".
    const now = Date.now();
    fs.utimesSync(stalePath, now / 1000, (now - 30_000) / 1000);
    fs.utimesSync(healthyPath, now / 1000, (now - 20_000) / 1000);
    fs.utimesSync(seedPath, now / 1000, now / 1000);
    expect(locateWrittenTraceByMtime(traceDir)).toBe(seedPath);

    // Ownership ignores mtime.
    expect(locateOwnedTrace(traceDir, healthyId).traceFile).toBe(healthyPath);
    expect(locateOwnedTrace(traceDir, staleId).traceFile).toBe(stalePath);
    expect(locateOwnedTrace(traceDir, seedId).traceFile).toBe(seedPath);

    const healthyOutcomes = readPersistedOutcomes(healthyPath);
    const staleOutcomes = readPersistedOutcomes(stalePath);
    expect(
      findPersistedOutcome(healthyOutcomes, "healthy.deadline.ui_fields_match"),
    ).toBe("passed");
    expect(
      findPersistedOutcome(staleOutcomes, "stale.deadline.ui_matches_saved"),
    ).toBe("failed");
    // Seed marker must not appear in case artifacts.
    expect(
      findPersistedOutcome(healthyOutcomes, "seed.marker"),
    ).toBeUndefined();
    expect(findPersistedOutcome(staleOutcomes, "seed.marker")).toBeUndefined();

    // Unrelated / missing run cannot satisfy a case.
    expect(locateOwnedTrace(traceDir, "ui-sync-nonexistent").missingArtifact).toBe(
      true,
    );
  });
});
