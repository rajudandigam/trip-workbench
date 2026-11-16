import { describe, expect, it } from "vitest";
import {
  informationalExitCode,
  overallFromSummary,
  strictEvidenceExitCode,
  summarizeResults,
  type EvidenceCaseResult,
} from "../../scripts/webmcp/evidence-status.js";

describe("native evidence status accounting", () => {
  it("keeps informational smoke exit 0 when only blocked", () => {
    const results: EvidenceCaseResult[] = [
      { id: "A", status: "blocked", mandatory: true },
      { id: "B", status: "blocked", mandatory: true },
      { id: "MODEL", status: "blocked", modelDirected: true },
    ];
    const summary = summarizeResults(results);
    const overall = overallFromSummary(summary);
    expect(overall).toBe("blocked");
    expect(informationalExitCode(overall)).toBe(0);
    expect(strictEvidenceExitCode(results).code).toBe(2);
  });

  it("strict mode requires every mandatory case to pass", () => {
    const results: EvidenceCaseResult[] = [
      { id: "A", status: "pass", mandatory: true },
      { id: "B", status: "pass", mandatory: true },
      { id: "MODEL", status: "not_run", modelDirected: true },
    ];
    expect(strictEvidenceExitCode(results)).toEqual({
      code: 0,
      reason: "All mandatory native evidence cases passed.",
    });
  });

  it("strict mode returns 1 for assertion failures and 2 for blocked mandatory", () => {
    expect(
      strictEvidenceExitCode([
        { id: "A", status: "fail", mandatory: true },
        { id: "B", status: "pass", mandatory: true },
      ]).code,
    ).toBe(1);
    expect(
      strictEvidenceExitCode([
        { id: "A", status: "pass", mandatory: true },
        { id: "B", status: "blocked", mandatory: true },
      ]).code,
    ).toBe(2);
  });

  it("ignores optional model cases for strict success", () => {
    const results: EvidenceCaseResult[] = [
      { id: "A", status: "pass", mandatory: true },
      { id: "MODEL", status: "fail", modelDirected: true, mandatory: false },
    ];
    expect(strictEvidenceExitCode(results).code).toBe(0);
    expect(informationalExitCode(overallFromSummary(summarizeResults(results)))).toBe(1);
  });
});
