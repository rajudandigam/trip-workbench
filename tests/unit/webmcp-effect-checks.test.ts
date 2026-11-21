import { describe, expect, it } from "vitest";
import {
  completedFromActual,
  evaluateTripEffectChecks,
  withoutResourceBinding,
} from "../../scripts/webmcp/effect-checks.js";

describe("webmcp effect checks", () => {
  const expected = {
    domain: "trip" as const,
    intendedResourceId: "trip-a",
    commandId: "cmd-1",
    action: "update",
    expectedOutcomes: ["applied"] as const,
    expectedFromRevision: 2,
    expectedToRevision: 3,
    expectedFields: { destination: "BOS" },
    expectedLocalEdit: { purpose: "Human edit while pending" },
  };

  const healthyActual = {
    observedResourceId: "trip-a",
    receipt: {
      commandId: "cmd-1",
      action: "update",
      outcome: "applied",
      tripId: "trip-a",
      fromRevision: 2,
      toRevision: 3,
    },
    savedRevision: 3,
    savedFields: { destination: "BOS", purpose: "Customer workshop" },
    localFields: { purpose: "Human edit while pending" },
    localObserved: true,
    submissions: 0,
  };

  it("passes a correct mutation observation set", () => {
    const actual = {
      ...healthyActual,
      completedObservations: completedFromActual(healthyActual),
    };
    const obs = evaluateTripEffectChecks(expected, actual);
    expect(obs.every((o) => o.verdict === "passed")).toBe(true);
  });

  it("fails wrong-resource while other checks can still pass", () => {
    const actual = {
      ...healthyActual,
      observedResourceId: "trip-b",
      completedObservations: completedFromActual({
        ...healthyActual,
        observedResourceId: "trip-b",
      }),
    };
    const obs = evaluateTripEffectChecks(expected, actual);
    const binding = obs.find((o) => o.name === "target_resource_matches");
    expect(binding?.verdict).toBe("failed");
    const ablated = withoutResourceBinding(obs);
    expect(ablated.every((o) => o.verdict === "passed")).toBe(true);
  });

  it("marks missing receipt as unknown, not fabricated failure", () => {
    const actual = {
      observedResourceId: "trip-a",
      receipt: null,
      savedFields: { destination: "BOS" },
      completedObservations: ["target_resource_matches", "requested_change_observed"],
    };
    const obs = evaluateTripEffectChecks(expected, actual);
    expect(
      obs.find((o) => o.name === "original_command_receipt_matches")?.verdict,
    ).toBe("unknown");
    expect(obs.find((o) => o.name === "capture_complete")?.verdict).toBe("failed");
  });

  it("does not pass local_edits_preserved for unrelated local text", () => {
    const actual = {
      ...healthyActual,
      localFields: { purpose: "completely unrelated draft note" },
      completedObservations: completedFromActual(healthyActual),
    };
    const obs = evaluateTripEffectChecks(expected, actual);
    expect(obs.find((o) => o.name === "local_edits_preserved")?.verdict).toBe(
      "failed",
    );
    expect(obs.every((o) => o.verdict === "passed")).toBe(false);
  });

  it("marks local_edits_preserved unknown when savedFields missing and local absent", () => {
    const actual = {
      observedResourceId: "trip-a",
      receipt: healthyActual.receipt,
      savedRevision: 3,
      savedFields: null,
      localObserved: false,
      submissions: 0,
      completedObservations: [
        "target_resource_matches",
        "original_command_receipt_matches",
        "revision_semantics_match",
        "no_unintended_submission",
      ],
    };
    const obs = evaluateTripEffectChecks(expected, actual);
    expect(obs.find((o) => o.name === "requested_change_observed")?.verdict).toBe(
      "unknown",
    );
    expect(obs.find((o) => o.name === "local_edits_preserved")?.verdict).toBe(
      "unknown",
    );
    expect(obs.every((o) => o.verdict === "passed")).toBe(false);
  });

  it("fails when outcome is no_change but revisions claim 2→3", () => {
    const actual = {
      ...healthyActual,
      receipt: {
        ...healthyActual.receipt,
        outcome: "no_change",
      },
      completedObservations: completedFromActual(healthyActual),
    };
    const obs = evaluateTripEffectChecks(expected, actual);
    expect(
      obs.find((o) => o.name === "original_command_receipt_matches")?.verdict,
    ).toBe("failed");
    expect(obs.find((o) => o.name === "revision_semantics_match")?.verdict).toBe(
      "failed",
    );
    expect(obs.every((o) => o.verdict === "passed")).toBe(false);
  });

  it("fails when receipt action differs from independently declared expected action", () => {
    const actual = {
      ...healthyActual,
      receipt: {
        ...healthyActual.receipt,
        action: "create",
      },
      completedObservations: completedFromActual(healthyActual),
    };
    const obs = evaluateTripEffectChecks(
      { ...expected, action: "update" },
      actual,
    );
    expect(
      obs.find((o) => o.name === "original_command_receipt_matches")?.verdict,
    ).toBe("failed");
  });

  it("cannot all-pass when resource or revision observations are missing", () => {
    const actual = {
      receipt: healthyActual.receipt,
      savedFields: { destination: "BOS" },
      submissions: 0,
      completedObservations: [
        "original_command_receipt_matches",
        "requested_change_observed",
        "no_unintended_submission",
      ],
    };
    const obs = evaluateTripEffectChecks(expected, actual);
    expect(obs.find((o) => o.name === "target_resource_matches")?.verdict).toBe(
      "unknown",
    );
    expect(obs.find((o) => o.name === "capture_complete")?.verdict).toBe("failed");
    expect(obs.every((o) => o.verdict === "passed")).toBe(false);
  });

  it("does not invent a pass for local edits on API-only journeys", () => {
    const apiExpected = {
      ...expected,
      expectedLocalEdit: undefined,
    };
    const actual = {
      observedResourceId: "trip-a",
      receipt: healthyActual.receipt,
      savedRevision: 3,
      savedFields: { destination: "BOS", purpose: "Customer workshop" },
      submissions: 0,
      completedObservations: [
        "target_resource_matches",
        "original_command_receipt_matches",
        "requested_change_observed",
        "revision_semantics_match",
        "no_unintended_submission",
      ],
    };
    const obs = evaluateTripEffectChecks(apiExpected, actual);
    expect(obs.find((o) => o.name === "local_edits_preserved")?.verdict).toBe(
      "unknown",
    );
    const required = obs.filter((o) => o.name !== "local_edits_preserved");
    expect(required.every((o) => o.verdict === "passed")).toBe(true);
  });

  it("marks revision_semantics_match unknown when savedRevision is absent despite matching receipt", () => {
    const actual = {
      observedResourceId: "trip-a",
      receipt: healthyActual.receipt,
      savedFields: { destination: "BOS", purpose: "Customer workshop" },
      submissions: 0,
      completedObservations: completedFromActual({
        observedResourceId: "trip-a",
        receipt: healthyActual.receipt,
        savedFields: { destination: "BOS" },
        submissions: 0,
      }),
    };
    expect(actual.completedObservations).not.toContain("revision_semantics_match");
    const obs = evaluateTripEffectChecks(expected, actual);
    expect(obs.find((o) => o.name === "revision_semantics_match")?.verdict).toBe(
      "unknown",
    );
    expect(obs.find((o) => o.name === "revision_semantics_match")?.method).toBe(
      "database",
    );
    expect(obs.find((o) => o.name === "capture_complete")?.verdict).toBe("failed");
    expect(obs.every((o) => o.verdict === "passed")).toBe(false);
  });

  it("passes revision_semantics_match when independent revision matches", () => {
    const actual = {
      ...healthyActual,
      completedObservations: completedFromActual(healthyActual),
    };
    expect(actual.completedObservations).toContain("revision_semantics_match");
    const obs = evaluateTripEffectChecks(expected, actual);
    expect(obs.find((o) => o.name === "revision_semantics_match")?.verdict).toBe(
      "passed",
    );
  });

  it("fails revision_semantics_match when independent revision mismatches", () => {
    const actual = {
      ...healthyActual,
      savedRevision: 2,
      completedObservations: completedFromActual({
        ...healthyActual,
        savedRevision: 2,
      }),
    };
    const obs = evaluateTripEffectChecks(expected, actual);
    expect(obs.find((o) => o.name === "revision_semantics_match")?.verdict).toBe(
      "failed",
    );
  });

  it("fails revision_semantics_match when receipt contradicts even if DB matches", () => {
    const actual = {
      ...healthyActual,
      receipt: {
        ...healthyActual.receipt,
        outcome: "no_change",
        fromRevision: 2,
        toRevision: 2,
      },
      savedRevision: 3,
      completedObservations: completedFromActual(healthyActual),
    };
    const obs = evaluateTripEffectChecks(expected, actual);
    expect(obs.find((o) => o.name === "revision_semantics_match")?.verdict).toBe(
      "failed",
    );
  });

  it("allows DB revision fact alone without claiming full receipt transition", () => {
    const actual = {
      observedResourceId: "trip-a",
      receipt: null,
      savedRevision: 3,
      savedFields: { destination: "BOS" },
      submissions: 0,
      completedObservations: completedFromActual({
        observedResourceId: "trip-a",
        receipt: null,
        savedRevision: 3,
        savedFields: { destination: "BOS" },
        submissions: 0,
      }),
    };
    const obs = evaluateTripEffectChecks(expected, actual);
    expect(
      obs.find((o) => o.name === "original_command_receipt_matches")?.verdict,
    ).toBe("unknown");
    expect(obs.find((o) => o.name === "revision_semantics_match")?.verdict).toBe(
      "passed",
    );
    expect(obs.find((o) => o.name === "capture_complete")?.verdict).toBe("failed");
  });
});
