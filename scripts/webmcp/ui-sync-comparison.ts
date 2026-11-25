/**
 * A/B/C scoring for the same UI-sync observations.
 *
 * A — final DOM after last repair/checkpoint (may miss pre-repair mismatch)
 * B — per-op deadline/repair facts already computed in the harness
 * C — persisted JSONL + public CLI check + Evidence verify (not in-memory args)
 *
 * Ownership: caseId → stable runId → `${basename(runId)}.jsonl` (never mtime).
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import type { SyncFact } from "./ui-sync-observer.js";
import {
  EXPECTED_UI_SYNC_CASE_IDS,
  type UiSyncCaseId,
  type UiSyncCaseStatus,
} from "./ui-sync-finalize.js";

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

/** Application effect relative to the case expectation — not fixtureStatus. */
export type OperationVerdict =
  | "met"
  | "unmet"
  | "unknown"
  | "refused"
  | "not_scored";

export type PhaseOutcome = "passed" | "failed" | "unknown" | "not_scored";

export type CaseAbcReport = {
  caseId: UiSyncCaseId;
  runId: string;
  traceFile: string | null;
  /** Did the fixture demonstrate the expected control behavior? */
  fixtureStatus: UiSyncCaseStatus;
  /** Did the app effect meet the case expectation? Independent of fixtureStatus. */
  operationVerdict: OperationVerdict;
  deadlineOutcome: PhaseOutcome;
  repairOutcome: PhaseOutcome;
  /** Did the persisted Evidence artifact verify? null when not scored. */
  evidenceVerified: boolean | null;
  /** Overall evidence gate for this case (CLI + named findings + bundle). */
  evidenceOk: boolean | null;
  lanes: {
    A: AbcLaneScore;
    B: AbcLaneScore;
    C: AbcLaneScore;
  };
};

export type CheckFinding = {
  ruleId?: string;
  status?: string;
  message?: string;
  actual?: unknown;
};

export type PersistedCliEvidenceResult = {
  runId: string;
  traceFile: string | null;
  evidenceDir: string | null;
  checkExit: number | null;
  verifyExit: number | null;
  /** Full bounded stdout used for JSON parse (not the display preview). */
  checkStdoutRaw: string;
  verifyStdoutRaw: string;
  /** Truncated preview for reports only — never parse this for decisions. */
  checkStdoutPreview: string;
  verifyStdoutPreview: string;
  checkJson: { ok?: boolean; findings?: CheckFinding[] } | null;
  checkParseError: string | null;
  cliError: string | null;
  outcomes: PersistedOutcome[];
  missingArtifact: boolean;
  /** True when stdout exceeded the bounded parse limit. */
  outputOverflow: boolean;
};

const OUTCOME_STATUSES = new Set<string>([
  "passed",
  "failed",
  "unknown",
  "skipped",
]);

/** Seed run is never a scored case artifact. */
export const UI_SYNC_SEED_RUN_ID = "ui-sync-seed";

const MAX_CLI_STDOUT_PARSE_BYTES = 1_000_000;

/** Stable runId for a matrix case (matches inspector.run(..., { runId })). */
export function runIdForCase(caseId: UiSyncCaseId): string {
  return `ui-sync-${caseId}`;
}

export function caseIdFromRunId(runId: string): UiSyncCaseId | null {
  for (const id of EXPECTED_UI_SYNC_CASE_IDS) {
    if (runIdForCase(id) === runId) return id;
  }
  return null;
}

/**
 * Mirror published AgentInspect getTraceFilePath basename safety without
 * importing /advanced (keeps Trip on the public consumer surface).
 */
export function safeRunIdBasename(runId: string): string {
  let safeId =
    typeof runId === "string" && runId.trim() !== "" ? runId.trim() : "run_unknown";
  safeId = path.basename(safeId);
  if (safeId === "" || safeId === "." || safeId === "..") {
    safeId = "run_unknown";
  }
  return safeId;
}

/** Deterministic path for a run — never select by mtime. */
export function resolveTraceForRun(traceDir: string, runId: string): string {
  return path.join(traceDir, `${safeRunIdBasename(runId)}.jsonl`);
}

/**
 * Locate the owned artifact for a runId.
 * Missing expected file → missingArtifact.
 * Presence of other JSONL files (seed, siblings) does not substitute.
 */
export function locateOwnedTrace(
  traceDir: string,
  runId: string,
): { traceFile: string | null; missingArtifact: boolean } {
  const expected = resolveTraceForRun(traceDir, runId);
  if (!fs.existsSync(expected) || !fs.statSync(expected).isFile()) {
    return { traceFile: null, missingArtifact: true };
  }
  return { traceFile: expected, missingArtifact: false };
}

/** @deprecated mtime selection — kept only so tests can prove the old bug. */
export function locateWrittenTraceByMtime(traceDir: string): string | null {
  if (!fs.existsSync(traceDir)) return null;
  const files = fs.readdirSync(traceDir).filter((n) => n.endsWith(".jsonl"));
  if (files.length === 0) return null;
  const ranked = files
    .map((name) => {
      const full = path.join(traceDir, name);
      return { full, mtime: fs.statSync(full).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);
  return ranked[0]?.full ?? null;
}

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

function defaultCliPath(): string {
  return path.resolve("node_modules/agent-inspect/packages/cli/dist/index.cjs");
}

/**
 * Extract the outermost JSON object from CLI stdout (optional prefix noise).
 * Never select an inner `{` by lastIndexOf — nested reports would parse wrong.
 */
export function extractOutermostJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i]!;
    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === "\\") {
        escape = true;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function isCheckJsonShape(
  value: unknown,
): value is { ok?: boolean; findings?: CheckFinding[] } {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  if ("ok" in obj && typeof obj.ok !== "boolean") return false;
  if ("findings" in obj && obj.findings != null && !Array.isArray(obj.findings)) {
    return false;
  }
  return true;
}

/** Parse agent-inspect `check --json` stdout into the outer report object. */
export function parseCheckJson(
  stdout: string,
): { json: PersistedCliEvidenceResult["checkJson"]; error: string | null } {
  const trimmed = stdout.trim();
  if (!trimmed) return { json: null, error: "empty check stdout" };

  // Prefer whole-stdout parse when the CLI emitted only JSON.
  if (trimmed.startsWith("{")) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (!isCheckJsonShape(parsed)) {
        return { json: null, error: "check JSON missing expected shape" };
      }
      return { json: parsed, error: null };
    } catch {
      // Fall through to outermost-object extraction for trailing noise.
    }
  }

  const slice = extractOutermostJsonObject(trimmed);
  if (slice == null) {
    return { json: null, error: "no JSON object in check stdout" };
  }
  try {
    const parsed: unknown = JSON.parse(slice);
    if (!isCheckJsonShape(parsed)) {
      return { json: null, error: "check JSON missing expected shape" };
    }
    return { json: parsed, error: null };
  } catch (error) {
    return {
      json: null,
      error: `invalid check JSON: ${(error as Error).message}`,
    };
  }
}

/**
 * After flush/close: resolve owned JSONL by runId, run public check + evidence-on,
 * then bundle verify. Must not score from in-memory observeOutcome args alone.
 */
export function runPersistedCliEvidence(input: {
  traceDir: string;
  runId: string;
  evidenceDir: string;
  cliPath?: string;
  /** Pass a tool name when a real tool step is expected; omit/null for synthetic. */
  requiredTool?: string | null;
  failOnObservation?: string;
}): PersistedCliEvidenceResult {
  const cli = input.cliPath ?? defaultCliPath();
  const owned = locateOwnedTrace(input.traceDir, input.runId);
  if (owned.missingArtifact || !owned.traceFile) {
    return {
      runId: input.runId,
      traceFile: null,
      evidenceDir: null,
      checkExit: null,
      verifyExit: null,
      checkStdoutRaw: "",
      verifyStdoutRaw: "",
      checkStdoutPreview: "",
      verifyStdoutPreview: "",
      checkJson: null,
      checkParseError: null,
      cliError: null,
      outcomes: [],
      missingArtifact: true,
      outputOverflow: false,
    };
  }

  fs.mkdirSync(input.evidenceDir, { recursive: true });
  const checkArgs = [
    cli,
    "check",
    owned.traceFile,
    "--fail-on-observation",
    input.failOnObservation ?? "failed,unknown,skipped",
    "--evidence-on",
    "always",
    "--evidence-dir",
    input.evidenceDir,
    "--evidence-format",
    "directory",
    "--json",
  ];
  if (input.requiredTool) {
    checkArgs.splice(3, 0, "--required-tool", input.requiredTool);
  }

  const check = spawnSync(process.execPath, checkArgs, {
    encoding: "utf8",
    maxBuffer: MAX_CLI_STDOUT_PARSE_BYTES + 64_000,
  });

  const verify = spawnSync(
    process.execPath,
    [cli, "bundle", "verify", input.evidenceDir],
    { encoding: "utf8", maxBuffer: MAX_CLI_STDOUT_PARSE_BYTES + 64_000 },
  );

  const checkStdoutRaw = check.stdout ?? "";
  const verifyStdoutRaw = verify.stdout ?? "";
  const outputOverflow =
    Buffer.byteLength(checkStdoutRaw, "utf8") > MAX_CLI_STDOUT_PARSE_BYTES;

  let checkParseError: string | null = null;
  let checkJson: PersistedCliEvidenceResult["checkJson"] = null;
  if (outputOverflow) {
    checkParseError = `check stdout exceeded ${MAX_CLI_STDOUT_PARSE_BYTES} byte parse bound`;
  } else {
    const parsed = parseCheckJson(checkStdoutRaw);
    checkJson = parsed.json;
    checkParseError = parsed.error;
  }

  const cliError =
    check.error != null
      ? `check spawn failed: ${check.error.message}`
      : verify.error != null
        ? `verify spawn failed: ${verify.error.message}`
        : null;

  return {
    runId: input.runId,
    traceFile: owned.traceFile,
    evidenceDir: input.evidenceDir,
    checkExit: check.status,
    verifyExit: verify.status,
    checkStdoutRaw,
    verifyStdoutRaw,
    checkStdoutPreview: checkStdoutRaw.slice(0, 1500),
    verifyStdoutPreview: verifyStdoutRaw.slice(0, 800),
    checkJson,
    checkParseError,
    cliError,
    outcomes: readPersistedOutcomes(owned.traceFile),
    missingArtifact: false,
    outputOverflow,
  };
}

/**
 * Required named observation statuses for negative / mixed cases.
 * Healthy cases expect check exit 0 + verify when a real tool was required.
 */
export function requiredNamedOutcomesForCase(
  caseId: UiSyncCaseId,
): Array<{ name: string; status: OutcomeStatus }> {
  switch (caseId) {
    case "healthy-update":
      return [
        { name: "healthy.deadline.ui_fields_match", status: "passed" },
        { name: "healthy.deadline.saved_fields_match", status: "passed" },
      ];
    case "stale-ui-then-repair":
      return [
        { name: "stale.deadline.ui_matches_saved", status: "failed" },
        { name: "stale.repair.ui_matches_saved", status: "passed" },
      ];
    case "missing-observer":
      return [{ name: "missing.deadline.ui_fields_match", status: "unknown" }];
    case "wrong-resource":
      return [{ name: "wrong.deadline.resource_binding", status: "failed" }];
    case "dirty-refusal":
      return [
        { name: "refusal.deadline.mutation_refused", status: "passed" },
        { name: "refusal.deadline.no_write", status: "passed" },
      ];
  }
}

/** Cases that invoke a real update_trip_draft tool step. */
export function requiredToolForCase(caseId: UiSyncCaseId): string | null {
  switch (caseId) {
    case "healthy-update":
    case "stale-ui-then-repair":
    case "dirty-refusal":
      return "update_trip_draft";
    case "missing-observer":
    case "wrong-resource":
      return null;
  }
}

/**
 * Evidence gate: missing/corrupt/CLI errors fail; expected negative findings
 * must be present by name for this run; unrelated failures fail.
 */
export function evaluateEvidenceGate(
  caseId: UiSyncCaseId,
  persisted: PersistedCliEvidenceResult,
): { ok: boolean; detail: string } {
  if (persisted.missingArtifact) {
    return { ok: false, detail: "missing owned JSONL artifact" };
  }
  if (persisted.cliError) {
    return { ok: false, detail: persisted.cliError };
  }
  if (persisted.outputOverflow) {
    return { ok: false, detail: "CLI stdout overflow" };
  }
  if (persisted.checkParseError) {
    return { ok: false, detail: persisted.checkParseError };
  }
  if (persisted.verifyExit !== 0) {
    return { ok: false, detail: `bundle verify exit ${persisted.verifyExit}` };
  }

  const required = requiredNamedOutcomesForCase(caseId);
  for (const req of required) {
    // Allow alternate names for stale deadline (ui_fields_match vs ui_matches_saved).
    if (req.name === "stale.deadline.ui_matches_saved") {
      const a = findPersistedOutcome(persisted.outcomes, req.name);
      const b = findPersistedOutcome(
        persisted.outcomes,
        "stale.deadline.ui_fields_match",
      );
      if (a !== "failed" && b !== "failed") {
        return {
          ok: false,
          detail: "missing required stale deadline failure in owned artifact",
        };
      }
      continue;
    }
    if (req.name === "stale.repair.ui_matches_saved") {
      const a = findPersistedOutcome(persisted.outcomes, req.name);
      const b = findPersistedOutcome(
        persisted.outcomes,
        "stale.repair.ui_fields_match",
      );
      if (a !== "passed" && b !== "passed") {
        return {
          ok: false,
          detail: "missing required stale repair pass in owned artifact",
        };
      }
      continue;
    }
    if (req.name.startsWith("refusal.deadline.")) {
      if (findPersistedOutcome(persisted.outcomes, req.name) !== req.status) {
        return {
          ok: false,
          detail: `required outcome ${req.name}=${req.status} not in owned artifact`,
        };
      }
      continue;
    }
    if (req.name === "missing.deadline.ui_fields_match") {
      const missing = persisted.outcomes.filter((o) =>
        o.name.startsWith("missing.deadline."),
      );
      if (
        missing.length === 0 ||
        !missing.every((o) => o.status === "unknown")
      ) {
        return {
          ok: false,
          detail: "missing required unknown missing-observer outcomes",
        };
      }
      continue;
    }
    if (findPersistedOutcome(persisted.outcomes, req.name) !== req.status) {
      return {
        ok: false,
        detail: `required outcome ${req.name}=${req.status} not in owned artifact`,
      };
    }
  }

  // Healthy: require successful check (exit 0) when tool was required.
  if (caseId === "healthy-update") {
    if (persisted.checkExit !== 0) {
      return {
        ok: false,
        detail: `healthy case check exit ${persisted.checkExit}`,
      };
    }
  }

  // CLI finding status is "fail" (severity may be "error"). OUTCOME status
  // "failed" is a different vocabulary — do not conflate them.
  const findings = persisted.checkJson?.findings ?? [];
  const unexpected = findings.filter((f) => {
    const status = (f.status ?? "").toLowerCase();
    if (status !== "fail" && status !== "failed" && status !== "error") {
      return false;
    }
    const rule = (f.ruleId ?? "").toLowerCase();
    const msg = (f.message ?? "").toLowerCase();
    const blob = `${rule} ${msg}`;

    // tool.usage / required-tool failures are never expected for these controls.
    if (/tool\.usage|required.?tool|missing.?tool/.test(blob)) return true;

    // Allow only observation-check findings that match the case's negative control.
    const isObservationFinding =
      rule.includes("observation") ||
      rule.startsWith("outcome") ||
      /\bobservation\b/.test(msg);

    if (caseId === "stale-ui-then-repair") {
      return !isObservationFinding;
    }
    if (caseId === "missing-observer") {
      return !(isObservationFinding || /unknown/.test(blob));
    }
    if (caseId === "wrong-resource") {
      return !(isObservationFinding || /binding/.test(blob));
    }
    if (caseId === "dirty-refusal") {
      return !isObservationFinding;
    }
    // healthy-update (and any other): every failing finding is unexpected.
    return true;
  });
  if (unexpected.length > 0) {
    return {
      ok: false,
      detail: `unrelated check findings: ${unexpected
        .map((f) => f.ruleId ?? f.message ?? "unknown")
        .join(", ")}`,
    };
  }

  return { ok: true, detail: "owned artifact + named findings + verify ok" };
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

export function scoreLaneAFinalDom(input: {
  caseId: UiSyncCaseId;
  fixtureStatus: UiSyncCaseStatus;
  finalDomFields?: Record<string, string> | null;
  expectedFinalDomFields?: Record<string, string> | null;
}): AbcLaneScore {
  if (input.fixtureStatus === "not_run" || input.fixtureStatus === "blocked") {
    return notScored("A", `fixture ${input.fixtureStatus}`);
  }
  if (
    input.caseId === "missing-observer" ||
    input.caseId === "wrong-resource"
  ) {
    return notScored(
      "A",
      "no final-DOM claim for synthetic control",
    );
  }
  if (!input.expectedFinalDomFields) {
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

export function scoreLaneCFromPersisted(input: {
  caseId: UiSyncCaseId;
  fixtureStatus: UiSyncCaseStatus;
  outcomes: readonly PersistedOutcome[];
  evidenceVerified: boolean | null;
  evidenceOk: boolean | null;
  missingArtifact?: boolean;
}): AbcLaneScore {
  if (input.fixtureStatus === "not_run" || input.fixtureStatus === "blocked") {
    return notScored("C", `fixture ${input.fixtureStatus}`);
  }
  if (input.missingArtifact) {
    return {
      lane: "C",
      verdict: "fail",
      detail: "missing written JSONL artifact for owned runId",
    };
  }
  if (input.evidenceOk === false) {
    return {
      lane: "C",
      verdict: "fail",
      detail: "evidence gate failed for owned artifact",
    };
  }
  if (input.evidenceOk === true) {
    return {
      lane: "C",
      verdict: "pass",
      detail: "owned artifact evidence gate passed",
    };
  }
  if (input.evidenceVerified !== true) {
    return {
      lane: "C",
      verdict: "fail",
      detail: "Evidence bundle verify did not succeed",
    };
  }

  // Fallback: named outcomes only (unit tests without full CLI result).
  const required = requiredNamedOutcomesForCase(input.caseId);
  for (const req of required) {
    if (req.name === "stale.deadline.ui_matches_saved") {
      const a = findPersistedOutcome(input.outcomes, req.name);
      const b = findPersistedOutcome(
        input.outcomes,
        "stale.deadline.ui_fields_match",
      );
      if (a !== "failed" && b !== "failed") {
        return {
          lane: "C",
          verdict: "fail",
          detail: "persisted stale deadline failure missing",
        };
      }
      continue;
    }
    if (req.name === "stale.repair.ui_matches_saved") {
      const a = findPersistedOutcome(input.outcomes, req.name);
      const b = findPersistedOutcome(
        input.outcomes,
        "stale.repair.ui_fields_match",
      );
      if (a !== "passed" && b !== "passed") {
        return {
          lane: "C",
          verdict: "fail",
          detail: "persisted stale repair pass missing",
        };
      }
      continue;
    }
    if (req.name.startsWith("refusal.deadline.")) {
      if (findPersistedOutcome(input.outcomes, req.name) !== req.status) {
        return {
          lane: "C",
          verdict: "fail",
          detail: `persisted ${req.name} missing`,
        };
      }
      continue;
    }
    if (req.name === "missing.deadline.ui_fields_match") {
      const missing = input.outcomes.filter((o) =>
        o.name.startsWith("missing.deadline."),
      );
      if (
        missing.length === 0 ||
        !missing.every((o) => o.status === "unknown")
      ) {
        return {
          lane: "C",
          verdict: "fail",
          detail: "persisted missing-observer unknowns missing",
        };
      }
      continue;
    }
    if (findPersistedOutcome(input.outcomes, req.name) !== req.status) {
      return {
        lane: "C",
        verdict: "fail",
        detail: `persisted ${req.name}=${req.status} missing`,
      };
    }
  }
  return {
    lane: "C",
    verdict: "pass",
    detail: "persisted named outcomes match case expectation",
  };
}

export function phaseOutcomeFromFacts(
  facts: SyncFact[] | undefined,
): PhaseOutcome {
  if (!facts || facts.length === 0) return "not_scored";
  if (facts.every((f) => f.verdict === "passed")) return "passed";
  if (facts.some((f) => f.verdict === "failed")) return "failed";
  if (facts.every((f) => f.verdict === "unknown")) return "unknown";
  if (facts.some((f) => f.verdict === "unknown")) return "unknown";
  return "failed";
}

/**
 * Derive operationVerdict from phase facts — not from fixtureStatus.
 * Fixture pass on a negative control does not mean the app mutation succeeded.
 */
export function operationVerdictFromPhases(input: {
  caseId: UiSyncCaseId;
  fixtureStatus: UiSyncCaseStatus;
  deadlineFacts?: SyncFact[];
  repairFacts?: SyncFact[];
}): OperationVerdict {
  if (input.fixtureStatus === "not_run" || input.fixtureStatus === "blocked") {
    return "not_scored";
  }
  if (input.caseId === "missing-observer") {
    return "unknown";
  }
  if (input.caseId === "dirty-refusal") {
    const deadline = input.deadlineFacts ?? [];
    const ok =
      deadline.length > 0 && deadline.every((f) => f.verdict === "passed");
    return ok ? "refused" : "unmet";
  }
  if (input.caseId === "stale-ui-then-repair") {
    const deadlineFailed = (input.deadlineFacts ?? []).some(
      (f) => f.name === "ui_matches_saved" && f.verdict === "failed",
    );
    const repairOk =
      (input.repairFacts?.length ?? 0) > 0 &&
      (input.repairFacts ?? []).every((f) => f.verdict === "passed");
    if (deadlineFailed && repairOk) return "met"; // repair met expectation
    return "unmet";
  }
  if (input.caseId === "wrong-resource") {
    const failed =
      (input.deadlineFacts ?? []).find((f) => f.name === "resource_binding")
        ?.verdict === "failed";
    return failed ? "unmet" : "unmet";
  }
  // healthy-update
  const ok =
    (input.deadlineFacts?.length ?? 0) > 0 &&
    (input.deadlineFacts ?? []).every((f) => f.verdict === "passed");
  return ok ? "met" : "unmet";
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
  evidenceOk?: boolean | null;
  missingArtifact?: boolean;
  traceFile?: string | null;
  operationVerdict?: OperationVerdict;
};

export function scoreCaseAbc(input: CaseAbcInput): CaseAbcReport {
  const runId = runIdForCase(input.caseId);
  const evidenceVerified =
    input.fixtureStatus === "not_run" || input.fixtureStatus === "blocked"
      ? null
      : input.missingArtifact
        ? false
        : input.evidenceVerified;
  const evidenceOk =
    input.fixtureStatus === "not_run" || input.fixtureStatus === "blocked"
      ? null
      : input.missingArtifact
        ? false
        : (input.evidenceOk ?? evidenceVerified);

  return {
    caseId: input.caseId,
    runId,
    traceFile: input.traceFile ?? null,
    fixtureStatus: input.fixtureStatus,
    operationVerdict:
      input.operationVerdict ??
      operationVerdictFromPhases({
        caseId: input.caseId,
        fixtureStatus: input.fixtureStatus,
        deadlineFacts: input.deadlineFacts,
        repairFacts: input.repairFacts,
      }),
    deadlineOutcome: phaseOutcomeFromFacts(input.deadlineFacts),
    repairOutcome: phaseOutcomeFromFacts(input.repairFacts),
    evidenceVerified,
    evidenceOk,
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
        evidenceVerified,
        evidenceOk,
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
      return { destination: "SFO" };
    case "dirty-refusal":
      return { destination: "SFO" };
    case "missing-observer":
    case "wrong-resource":
      return null;
  }
}

/**
 * Combine matrix fixture status with per-case evidence gates for process exit.
 * A green fixture cannot hide failed evidence.
 */
export function combineUiSyncExit(input: {
  matrixExitCode: number;
  matrixOk: boolean;
  caseEvidence: ReadonlyArray<{ caseId: UiSyncCaseId; evidenceOk: boolean | null }>;
}): { exitCode: number; ok: boolean; evidenceFailed: UiSyncCaseId[] } {
  const evidenceFailed = input.caseEvidence
    .filter((c) => c.evidenceOk === false)
    .map((c) => c.caseId);
  if (evidenceFailed.length > 0) {
    return { exitCode: 1, ok: false, evidenceFailed };
  }
  return {
    exitCode: input.matrixExitCode,
    ok: input.matrixOk,
    evidenceFailed: [],
  };
}
