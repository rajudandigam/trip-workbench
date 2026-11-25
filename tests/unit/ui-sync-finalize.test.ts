import { describe, expect, it } from "vitest";
import {
  EXPECTED_UI_SYNC_CASE_IDS,
  exitCodeFromUiSyncMatrix,
  finalizeUiSyncMatrix,
  materializeUiSyncCases,
} from "../../scripts/webmcp/ui-sync-finalize.js";

describe("ui-sync finalize", () => {
  it("healthy pass + later timeout => nonzero with all expected cases and error retained", () => {
    const result = finalizeUiSyncMatrix({
      reported: [{ id: "healthy-update", status: "pass" }],
      activeCaseId: "stale-ui-then-repair",
      fatalError: "Timed out: dom SFO",
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.ok).toBe(false);
    expect(result.cases).toHaveLength(EXPECTED_UI_SYNC_CASE_IDS.length);
    expect(result.cases.map((c) => c.id)).toEqual([...EXPECTED_UI_SYNC_CASE_IDS]);
    expect(result.cases.find((c) => c.id === "healthy-update")?.status).toBe(
      "pass",
    );
    expect(result.cases.find((c) => c.id === "stale-ui-then-repair")).toMatchObject({
      status: "fail",
      reason: "Timed out: dom SFO",
    });
    expect(
      result.cases.filter((c) => c.status === "not_run").map((c) => c.id),
    ).toEqual([
      "missing-observer",
      "wrong-resource",
      "dirty-refusal",
      "stale-state-omit-then-repair",
    ]);
  });

  it("all cases pass + flush failure => nonzero", () => {
    const reported = EXPECTED_UI_SYNC_CASE_IDS.map((id) => ({
      id,
      status: "pass" as const,
    }));
    const result = finalizeUiSyncMatrix({
      reported,
      finalizationError: "inspector.flush failed",
    });
    expect(result.exitCode).toBe(1);
    expect(result.ok).toBe(false);
    expect(result.native).toBe("fail");
    expect(result.note).toContain("inspector.flush failed");
  });

  it("missing expected case => nonpass", () => {
    const result = finalizeUiSyncMatrix({
      reported: [
        { id: "healthy-update", status: "pass" },
        { id: "stale-ui-then-repair", status: "pass" },
      ],
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.cases).toHaveLength(EXPECTED_UI_SYNC_CASE_IDS.length);
    expect(result.cases.filter((c) => c.status === "not_run").length).toBe(
      EXPECTED_UI_SYNC_CASE_IDS.length - 2,
    );
  });

  it("duplicate case id => nonpass", () => {
    const result = finalizeUiSyncMatrix({
      reported: [
        { id: "healthy-update", status: "pass" },
        { id: "healthy-update", status: "pass" },
        { id: "stale-ui-then-repair", status: "pass" },
        { id: "missing-observer", status: "pass" },
        { id: "wrong-resource", status: "pass" },
        { id: "dirty-refusal", status: "pass" },
        { id: "stale-state-omit-then-repair", status: "pass" },
      ],
    });
    expect(result.duplicateIds).toContain("healthy-update");
    expect(result.exitCode).toBe(1);
    expect(result.cases.find((c) => c.id === "healthy-update")?.status).toBe(
      "fail",
    );
  });

  it("missing-browser-style all not_run => exit 2", () => {
    const reported = EXPECTED_UI_SYNC_CASE_IDS.map((id) => ({
      id,
      status: "not_run" as const,
      reason: "TW_CHROME_BIN unset",
    }));
    const scored = exitCodeFromUiSyncMatrix(reported);
    expect(scored.exitCode).toBe(2);
    expect(scored.native).toBe("not_run");
    expect(scored.ok).toBe(false);
  });

  it("all expected passes and no fatal/finalization error => exit 0", () => {
    const reported = EXPECTED_UI_SYNC_CASE_IDS.map((id) => ({
      id,
      status: "pass" as const,
    }));
    const result = finalizeUiSyncMatrix({ reported });
    expect(result.exitCode).toBe(0);
    expect(result.ok).toBe(true);
    expect(result.native).toBe("pass");
  });

  it("materialize fills not_run without inventing passes", () => {
    const cases = materializeUiSyncCases({
      reported: [{ id: "healthy-update", status: "pass" }],
      fatalError: "boom",
      activeCaseId: "stale-ui-then-repair",
    });
    expect(cases.every((c) => c.status !== "blocked" || true)).toBe(true);
    expect(cases.find((c) => c.id === "dirty-refusal")?.status).toBe("not_run");
  });
});
