import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  findPersistedOutcome,
  readPersistedOutcomes,
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
  it("lane A passes healthy final DOM and misses nothing claimed for synthetic controls", () => {
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
        caseId: "stale-ui-then-repair",
        fixtureStatus: "pass",
        finalDomFields: { destination: "SFO" },
        expectedFinalDomFields: { destination: "SFO" },
      }).verdict,
    ).toBe("pass");

    expect(
      scoreLaneAFinalDom({
        caseId: "missing-observer",
        fixtureStatus: "pass",
        expectedFinalDomFields: null,
      }).verdict,
    ).toBe("pass");
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
    expect(scored.detail).toMatch(/deadline detected/i);

    // Lane A alone would look healthy after repair — that is intentional.
    expect(
      scoreLaneAFinalDom({
        caseId: "stale-ui-then-repair",
        fixtureStatus: "pass",
        finalDomFields: { destination: "SFO" },
        expectedFinalDomFields: { destination: "SFO" },
      }).verdict,
    ).toBe("pass");
  });

  it("lane C requires earlier deadline failure still present after repair in fixture trace", () => {
    const outcomes = [
      { name: "stale.deadline.ui_matches_saved", status: "failed" as const },
      { name: "stale.deadline.ui_fields_match", status: "failed" as const },
      { name: "stale.repair.ui_matches_saved", status: "passed" as const },
      { name: "stale.repair.ui_fields_match", status: "passed" as const },
    ];
    expect(
      scoreLaneCFromPersisted({
        caseId: "stale-ui-then-repair",
        fixtureStatus: "pass",
        outcomes,
        evidenceVerified: true,
      }).verdict,
    ).toBe("pass");

    // After repair only — earlier failure dropped from disk → nonpass.
    expect(
      scoreLaneCFromPersisted({
        caseId: "stale-ui-then-repair",
        fixtureStatus: "pass",
        outcomes: [
          { name: "stale.repair.ui_matches_saved", status: "passed" },
        ],
        evidenceVerified: true,
      }).verdict,
    ).toBe("fail");
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
    expect(report.lanes.C.verdict).toBe("fail");
    expect(report.lanes.C.detail).toMatch(/missing written JSONL/i);
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
        JSON.stringify({
          kind: "STEP",
          name: "update_trip_draft",
        }),
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
    expect(findPersistedOutcome(outcomes, "stale.repair.ui_fields_match")).toBe(
      "passed",
    );
  });

  it("runPersistedCliEvidence reports missingArtifact when no JSONL exists", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tw-abc-empty-"));
    const evidenceDir = path.join(dir, "evidence");
    const result = runPersistedCliEvidence({
      traceDir: path.join(dir, "traces-missing"),
      evidenceDir,
    });
    expect(result.missingArtifact).toBe(true);
    expect(result.traceFile).toBeNull();
    expect(result.outcomes).toEqual([]);
  });
});
