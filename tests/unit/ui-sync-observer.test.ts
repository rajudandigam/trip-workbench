import { describe, expect, it } from "vitest";
import {
  evaluateUiSyncAtDeadline,
  isStaleUiAtDeadline,
} from "../../scripts/webmcp/ui-sync-observer.js";

describe("ui-sync observer", () => {
  const expected = {
    resourceId: "trip-a",
    expectedDomFields: { destination: "BOS" },
    expectedSavedFields: { destination: "BOS" },
    expectedRevision: 3,
  };

  it("passes a healthy deadline observation", () => {
    const facts = evaluateUiSyncAtDeadline(expected, {
      resourceId: "trip-a",
      domFields: { destination: "BOS" },
      savedFields: { destination: "BOS" },
      savedRevision: 3,
      observerPresent: true,
    });
    expect(facts.every((f) => f.verdict === "passed")).toBe(true);
  });

  it("detects stale UI when DB committed but DOM lagged", () => {
    const facts = evaluateUiSyncAtDeadline(expected, {
      resourceId: "trip-a",
      domFields: { destination: "JFK" },
      savedFields: { destination: "BOS" },
      savedRevision: 3,
      observerPresent: true,
    });
    expect(facts.find((f) => f.name === "saved_fields_match")?.verdict).toBe(
      "passed",
    );
    expect(facts.find((f) => f.name === "ui_fields_match")?.verdict).toBe(
      "failed",
    );
    expect(facts.find((f) => f.name === "ui_matches_saved")?.verdict).toBe(
      "failed",
    );
    expect(isStaleUiAtDeadline(facts)).toBe(true);
  });

  it("marks missing observer as unknown/nonpass", () => {
    const facts = evaluateUiSyncAtDeadline(expected, { observerPresent: false });
    expect(facts.every((f) => f.verdict === "unknown")).toBe(true);
    expect(facts.every((f) => f.verdict === "passed")).toBe(false);
  });

  it("fails wrong-resource binding", () => {
    const facts = evaluateUiSyncAtDeadline(expected, {
      resourceId: "trip-b",
      domFields: { destination: "BOS" },
      savedFields: { destination: "BOS" },
      savedRevision: 3,
      observerPresent: true,
    });
    expect(facts.find((f) => f.name === "resource_binding")?.verdict).toBe(
      "failed",
    );
  });

  it("passes dirty refusal with zero writes", () => {
    const facts = evaluateUiSyncAtDeadline(
      {
        ...expected,
        expectRefusal: true,
        expectedErrorCode: "USER_EDIT_IN_PROGRESS",
        expectedRevision: 2,
      },
      {
        resourceId: "trip-a",
        appOk: false,
        errorCode: "USER_EDIT_IN_PROGRESS",
        patchCount: 0,
        savedRevision: 2,
        observerPresent: true,
      },
    );
    expect(facts.find((f) => f.name === "mutation_refused")?.verdict).toBe(
      "passed",
    );
    expect(facts.find((f) => f.name === "no_write")?.verdict).toBe("passed");
  });
});
