/**
 * A/B/C scoring for the same UI-sync observations.
 *
 * A — final DOM after last repair/checkpoint (may miss pre-repair mismatch)
 * B — per-op deadline/repair facts already computed in the harness
 * C — persisted JSONL + public CLI check + Evidence verify (not in-memory args)
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import type { SyncFact } from "./ui-sync-observer.js";
import type { UiSyncCaseId, UiSyncCaseStatus } from "./ui-sync-finalize.js";

export type LaneId = "A" | "B" | "C";
export type LaneVerdict = "pass" | "fail" | "not_scored";

export type OutcomeStatus = "passed" | "failed" | "unknown" | "skipped";

export type PersistedOutcome = {
  name: string;
  status: OutcomeStatus;
};

export type AbcLaneScore = {
  lane: LaneId;
  verdict: LaneVerdict;
  detail: string;
};

export type CaseAbcReport = {
  caseId: UiSyncCaseId;
  /** Did the fixture demonstrate the expected control behavior? */
  fixtureStatus: UiSyncCaseStatus;
  /** Did the app effect meet the case expectation? */
  operationVerdict: "met" | "unmet" | "not_scored";
  /** Did the persisted Evidence artifact verify? null when not scored. */
  evidenceVerified: boolean | null;
  lanes: {
    A: AbcLaneScore;
    B: AbcLaneScore;
    C: AbcLaneScore;
  };
};

export type PersistedCliEvidenceResult = {
  traceFile: string | null;
  evidenceDir: string | null;
  checkExit: number | null;
  verifyExit: number | null;
  checkStdout: string;
  verifyStdout: string;
  outcomes: PersistedOutcome[];
  missingArtifact: boolean;
};

const OUTCOME_STATUSES = new Set<string>([
  "passed",
  "failed",
  "unknown",
  "skipped",
]);

/** Read OUTCOME statuses from a written JSONL trace (lane C source of truth). */
export function readPersistedOutcomes(traceFile: string): PersistedOutcome[] {
  if (!fs.existsSync(traceFile)) return [];
  const lines = fs.readFileSync(traceFile, "utf8").split("\n").filter(Boolean);
  const out: PersistedOutcome[] = [];
  for (const line of lines) {
    let event: {
      kind?: string;
      name?: string;
      attributes?: { outcomeStatus?: string; status?: string };
    };
    try {
      event = JSON.parse(line) as typeof event;
    } catch {
      continue;
    }
    if (event.kind !== "OUTCOME" || typeof event.name !== "string") continue;
    const status = (event.attributes?.outcomeStatus ??
      event.attributes?.status) as string | undefined;
    if (status && OUTCOME_STATUSES.has(status)) {
      out.push({ name: event.name, status: status as OutcomeStatus });
    }
  }
  return out;
}

export function findPersistedOutcome(
  outcomes: readonly PersistedOutcome[],
  name: string,
): OutcomeStatus | undefined {
  return outcomes.find((o) => o.name === name)?.status;
}

export function locateWrittenTrace(traceDir: string): string | null {
  if (!fs.existsSync(traceDir)) return null;
  const files = fs.readdirSync(traceDir).filter((n) => n.endsWith(".jsonl"));
  if (files.length === 0) return null;
  // Prefer the newest when multiple writers flushed.
  const ranked = files
    .map((name) => {
      const full = path.join(traceDir, name);
      return { full, mtime: fs.statSync(full).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);
  return ranked[0]?.full ?? null;
}

function defaultCliPath(): string {
  return path.resolve("node_modules/agent-inspect/packages/cli/dist/index.cjs");
}

/**
 * After flush/close: locate written JSONL, run public check + evidence-on,
 * then bundle verify. Must not score from in-memory observeOutcome args alone.
 */
export function runPersistedCliEvidence(input: {
  traceDir: string;
  evidenceDir: string;
  cliPath?: string;
  requiredTool?: string;
  failOnObservation?: string;
}): PersistedCliEvidenceResult {
  const cli = input.cliPath ?? defaultCliPath();
  const traceFile = locateWrittenTrace(input.traceDir);
  if (!traceFile) {
    return {
      traceFile: null,
      evidenceDir: null,
      checkExit: null,
      verifyExit: null,
      checkStdout: "",
      verifyStdout: "",
      outcomes: [],
      missingArtifact: true,
    };
  }

  fs.mkdirSync(input.evidenceDir, { recursive: true });
  const check = spawnSync(
    process.execPath,
    [
      cli,
      "check",
      traceFile,
      "--required-tool",
      input.requiredTool ?? "update_trip_draft",
      "--fail-on-observation",
      input.failOnObservation ?? "failed,unknown,skipped",
      "--evidence-on",
      "always",
      "--evidence-dir",
      input.evidenceDir,
      "--evidence-format",
      "directory",
      "--json",
    ],
    { encoding: "utf8" },
  );

  const verify = spawnSync(
    process.execPath,
    [cli, "bundle", "verify", input.evidenceDir],
    { encoding: "utf8" },
  );

  return {
    traceFile,
    evidenceDir: input.evidenceDir,
    checkExit: check.status,
    verifyExit: verify.status,
    checkStdout: (check.stdout ?? "").slice(0, 4000),
    verifyStdout: (verify.stdout ?? "").slice(0, 2000),
    outcomes: readPersistedOutcomes(traceFile),
    missingArtifact: false,
  };
}

function fieldsMatch(
  expected: Record<string, string>,
  actual: Record<string, string> | null | undefined,
): boolean {
  if (!actual) return false;
  for (const [key, value] of Object.entries(expected)) {
    if (actual[key] !== value) return false;
  }
  return true;
}

function notScored(lane: LaneId, detail: string): AbcLaneScore {
  return { lane, verdict: "not_scored", detail };
}

/**
 * Lane A: final DOM after last repair/checkpoint.
 * For stale-ui-then-repair, a healthy final DOM is expected (blind spot vs B/C).
 */
export function scoreLaneAFinalDom(input: {
  caseId: UiSyncCaseId;
  fixtureStatus: UiSyncCaseStatus;
  finalDomFields?: Record<string, string> | null;
  expectedFinalDomFields?: Record<string, string> | null;
}): AbcLaneScore {
  if (input.fixtureStatus === "not_run" || input.fixtureStatus === "blocked") {
    return notScored("A", `fixture ${input.fixtureStatus}`);
  }
  if (!input.expectedFinalDomFields) {
    // Cases without a final-DOM claim (missing-observer / wrong-resource controls).
    if (
      input.caseId === "missing-observer" ||
      input.caseId === "wrong-resource"
    ) {
      return {
        lane: "A",
        verdict: "pass",
        detail: "no final-DOM claim for synthetic control; lane A N/A-as-pass",
      };
    }
    return notScored("A", "no expected final DOM fields");
  }
  const ok = fieldsMatch(input.expectedFinalDomFields, input.finalDomFields);
  return {
    lane: "A",
    verdict: ok ? "pass" : "fail",
    detail: ok
      ? "final DOM matches expected post-checkpoint fields"
      : `final DOM mismatch: expected=${JSON.stringify(input.expectedFinalDomFields)} actual=${JSON.stringify(input.finalDomFields ?? null)}`,
  };
}

/**
 * Lane B: per-op deadline/repair facts already computed.
 * Detects injected mismatch at deadline even when final DOM later looks healthy.
 */
export function scoreLaneBPerOp(input: {
  caseId: UiSyncCaseId;
  fixtureStatus: UiSyncCaseStatus;
  deadlineFacts?: SyncFact[];
  repairFacts?: SyncFact[];
}): AbcLaneScore {
  if (input.fixtureStatus === "not_run" || input.fixtureStatus === "blocked") {
    return notScored("B", `fixture ${input.fixtureStatus}`);
  }
  const deadline = input.deadlineFacts ?? [];
  const repair = input.repairFacts ?? [];

  if (input.caseId === "stale-ui-then-repair") {
    const deadlineFailed = deadline.some(
      (f) => f.name === "ui_matches_saved" && f.verdict === "failed",
    );
    const repairOk =
      repair.length > 0 && repair.every((f) => f.verdict === "passed");
    const ok = deadlineFailed && repairOk;
    return {
      lane: "B",
      verdict: ok ? "pass" : "fail",
      detail: ok
        ? "deadline detected injected mismatch; repair facts passed"
        : "per-op facts did not show deadline fail + repair pass",
    };
  }

  if (input.caseId === "missing-observer") {
    const ok =
      deadline.length > 0 && deadline.every((f) => f.verdict === "unknown");
    return {
      lane: "B",
      verdict: ok ? "pass" : "fail",
      detail: ok
        ? "per-op facts all unknown (missing observer)"
        : "expected all unknown deadline facts",
    };
  }

  if (input.caseId === "wrong-resource") {
    const ok =
      deadline.find((f) => f.name === "resource_binding")?.verdict === "failed";
    return {
      lane: "B",
      verdict: ok ? "pass" : "fail",
      detail: ok
        ? "per-op resource_binding failed as expected"
        : "expected resource_binding failed",
    };
  }

  // healthy-update / dirty-refusal: all deadline facts passed
  const ok =
    deadline.length > 0 && deadline.every((f) => f.verdict === "passed");
  return {
    lane: "B",
    verdict: ok ? "pass" : "fail",
    detail: ok
      ? "per-op deadline facts all passed"
      : "per-op deadline facts not all passed",
  };
}

/**
 * Lane C: score from persisted OUTCOME events + Evidence verify.
 * Nonzero check exits are fixture-pass only when the intended named observation
 * explains the finding (e.g. stale deadline failure retained after repair).
 */
export function scoreLaneCFromPersisted(input: {
  caseId: UiSyncCaseId;
  fixtureStatus: UiSyncCaseStatus;
  outcomes: readonly PersistedOutcome[];
  evidenceVerified: boolean | null;
  missingArtifact?: boolean;
}): AbcLaneScore {
  if (input.fixtureStatus === "not_run" || input.fixtureStatus === "blocked") {
    return notScored("C", `fixture ${input.fixtureStatus}`);
  }
  if (input.missingArtifact) {
    return {
      lane: "C",
      verdict: "fail",
      detail: "missing written JSONL artifact",
    };
  }
  if (input.evidenceVerified !== true) {
    return {
      lane: "C",
      verdict: "fail",
      detail: "Evidence bundle verify did not succeed",
    };
  }

  const has = (name: string, status: OutcomeStatus) =>
    findPersistedOutcome(input.outcomes, name) === status;

  if (input.caseId === "healthy-update") {
    const ok =
      has("healthy.deadline.ui_fields_match", "passed") &&
      has("healthy.deadline.saved_fields_match", "passed");
    return {
      lane: "C",
      verdict: ok ? "pass" : "fail",
      detail: ok
        ? "persisted healthy deadline outcomes passed"
        : "persisted healthy deadline outcomes missing/nonpass",
    };
  }

  if (input.caseId === "stale-ui-then-repair") {
    // Earlier failure must survive in written evidence after repair.
    const deadlineFail =
      has("stale.deadline.ui_matches_saved", "failed") ||
      has("stale.deadline.ui_fields_match", "failed");
    const repairPass =
      has("stale.repair.ui_matches_saved", "passed") ||
      has("stale.repair.ui_fields_match", "passed");
    const ok = deadlineFail && repairPass;
    return {
      lane: "C",
      verdict: ok ? "pass" : "fail",
      detail: ok
        ? "persisted deadline failure retained after repair; repair outcomes passed"
        : "persisted stale deadline failure and/or repair pass missing",
    };
  }

  if (input.caseId === "missing-observer") {
    const names = input.outcomes.filter((o) =>
      o.name.startsWith("missing.deadline."),
    );
    const ok =
      names.length > 0 && names.every((o) => o.status === "unknown");
    return {
      lane: "C",
      verdict: ok ? "pass" : "fail",
      detail: ok
        ? "persisted missing-observer outcomes unknown"
        : "expected persisted unknown outcomes for missing observer",
    };
  }

  if (input.caseId === "wrong-resource") {
    const ok = has("wrong.deadline.resource_binding", "failed");
    return {
      lane: "C",
      verdict: ok ? "pass" : "fail",
      detail: ok
        ? "persisted wrong-resource binding failed"
        : "expected persisted resource_binding failed",
    };
  }

  // dirty-refusal
  const refusalOutcomes = input.outcomes.filter((o) =>
    o.name.startsWith("refusal.deadline."),
  );
  const ok =
    refusalOutcomes.length > 0 &&
    refusalOutcomes.every((o) => o.status === "passed");
  return {
    lane: "C",
    verdict: ok ? "pass" : "fail",
    detail: ok
      ? "persisted dirty-refusal deadline outcomes passed"
      : "expected persisted refusal deadline outcomes passed",
  };
}

export function operationVerdictFromFixture(
  fixtureStatus: UiSyncCaseStatus,
): CaseAbcReport["operationVerdict"] {
  if (fixtureStatus === "pass") return "met";
  if (fixtureStatus === "fail") return "unmet";
  return "not_scored";
}

export type CaseAbcInput = {
  caseId: UiSyncCaseId;
  fixtureStatus: UiSyncCaseStatus;
  deadlineFacts?: SyncFact[];
  repairFacts?: SyncFact[];
  finalDomFields?: Record<string, string> | null;
  expectedFinalDomFields?: Record<string, string> | null;
  outcomes: readonly PersistedOutcome[];
  evidenceVerified: boolean | null;
  missingArtifact?: boolean;
};

export function scoreCaseAbc(input: CaseAbcInput): CaseAbcReport {
  const evidenceVerified =
    input.fixtureStatus === "not_run" || input.fixtureStatus === "blocked"
      ? null
      : input.missingArtifact
        ? false
        : input.evidenceVerified;

  return {
    caseId: input.caseId,
    fixtureStatus: input.fixtureStatus,
    operationVerdict: operationVerdictFromFixture(input.fixtureStatus),
    evidenceVerified,
    lanes: {
      A: scoreLaneAFinalDom({
        caseId: input.caseId,
        fixtureStatus: input.fixtureStatus,
        finalDomFields: input.finalDomFields,
        expectedFinalDomFields: input.expectedFinalDomFields,
      }),
      B: scoreLaneBPerOp({
        caseId: input.caseId,
        fixtureStatus: input.fixtureStatus,
        deadlineFacts: input.deadlineFacts,
        repairFacts: input.repairFacts,
      }),
      C: scoreLaneCFromPersisted({
        caseId: input.caseId,
        fixtureStatus: input.fixtureStatus,
        outcomes: input.outcomes,
        evidenceVerified:
          input.fixtureStatus === "not_run" ||
          input.fixtureStatus === "blocked"
            ? null
            : evidenceVerified,
        missingArtifact: input.missingArtifact,
      }),
    },
  };
}

/** Expected final DOM fields used by lane A for each case when scored. */
export function expectedFinalDomForCase(
  caseId: UiSyncCaseId,
): Record<string, string> | null {
  switch (caseId) {
    case "healthy-update":
      return { destination: "BOS" };
    case "stale-ui-then-repair":
      // After repair the DOM looks healthy — lane A blind spot vs B/C.
      return { destination: "SFO" };
    case "dirty-refusal":
      // Destination unchanged by refused update (seed ended at SFO after stale).
      return { destination: "SFO" };
    case "missing-observer":
    case "wrong-resource":
      return null;
  }
}
