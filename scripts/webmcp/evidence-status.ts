/**
 * Status accounting for native WebMCP evidence runs.
 * Keep descriptive pass/fail/blocked/not_run separate from strict CI exit codes.
 */

export type EvidenceCaseStatus = "pass" | "fail" | "blocked" | "not_run";

export type EvidenceCaseResult = {
  id: string;
  status: EvidenceCaseStatus;
  mandatory?: boolean;
  modelDirected?: boolean;
  reason?: string;
};

export type EvidenceSummary = {
  pass: number;
  fail: number;
  blocked: number;
  not_run: number;
};

export type EvidenceOverall = "pass" | "fail" | "blocked" | "not_run";

/** Informational smoke overall (historical): any fail → fail; else any pass → pass; else blocked/not_run. */
export function summarizeResults(results: readonly EvidenceCaseResult[]): EvidenceSummary {
  return {
    pass: results.filter((r) => r.status === "pass").length,
    fail: results.filter((r) => r.status === "fail").length,
    blocked: results.filter((r) => r.status === "blocked").length,
    not_run: results.filter((r) => r.status === "not_run").length,
  };
}

export function overallFromSummary(summary: EvidenceSummary): EvidenceOverall {
  if (summary.fail > 0) return "fail";
  if (summary.pass > 0) return "pass";
  if (summary.blocked > 0) return "blocked";
  return "not_run";
}

/**
 * Informational smoke exit: only assertion failures are nonzero.
 * Blocked/not_run with zero fails still exits 0 (developer smoke).
 */
export function informationalExitCode(overall: EvidenceOverall): number {
  return overall === "fail" ? 1 : 0;
}

/**
 * Strict evidence exit:
 * - 0 only when every mandatory case ran and passed
 * - 1 when a mandatory case failed its assertions
 * - 2 when a mandatory case is blocked or not_run
 * Model-directed / optional cases never make the gate pass and are ignored for success.
 */
export function strictEvidenceExitCode(
  results: readonly EvidenceCaseResult[],
): { code: number; reason: string } {
  const mandatory = results.filter((r) => r.mandatory !== false && r.modelDirected !== true);
  if (mandatory.length === 0) {
    return { code: 2, reason: "No mandatory native evidence cases were registered." };
  }
  const failed = mandatory.filter((r) => r.status === "fail");
  if (failed.length > 0) {
    return {
      code: 1,
      reason: `Mandatory case(s) failed: ${failed.map((r) => r.id).join(", ")}`,
    };
  }
  const incomplete = mandatory.filter(
    (r) => r.status === "blocked" || r.status === "not_run",
  );
  if (incomplete.length > 0) {
    return {
      code: 2,
      reason: `Mandatory case(s) did not execute: ${incomplete.map((r) => r.id).join(", ")}`,
    };
  }
  const allPassed = mandatory.every((r) => r.status === "pass");
  if (!allPassed) {
    return { code: 2, reason: "Mandatory cases did not all pass." };
  }
  return { code: 0, reason: "All mandatory native evidence cases passed." };
}
