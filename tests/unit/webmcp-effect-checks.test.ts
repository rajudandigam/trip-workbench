import { describe, expect, it } from "vitest";
import {
  evaluateTripEffectChecks,
  withoutResourceBinding,
} from "../../scripts/webmcp/effect-checks.js";

describe("webmcp effect checks", () => {
  const expected = {
    domain: "trip" as const,
    intendedResourceId: "trip-a",
    commandId: "cmd-1",
    action: "update_trip",
    expectedFromRevision: 2,
    expectedToRevision: 3,
    expectedFields: { destination: "BOS" },
  };

  it("passes a correct mutation observation set", () => {
    const obs = evaluateTripEffectChecks(expected, {
      observedResourceId: "trip-a",
      receipt: {
        commandId: "cmd-1",
        action: "update_trip",
        outcome: "applied",
        fromRevision: 2,
        toRevision: 3,
      },
      savedFields: { destination: "BOS", purpose: "Customer workshop" },
      localFields: { purpose: "Human edit while pending" },
      submissions: 0,
      captureComplete: true,
    });
    expect(obs.every((o) => o.verdict === "passed")).toBe(true);
  });

  it("fails wrong-resource while other checks can still pass", () => {
    const obs = evaluateTripEffectChecks(expected, {
      observedResourceId: "trip-b",
      receipt: {
        commandId: "cmd-1",
        action: "update_trip",
        outcome: "applied",
        fromRevision: 2,
        toRevision: 3,
      },
      savedFields: { destination: "BOS" },
      localFields: { purpose: "local" },
      submissions: 0,
      captureComplete: true,
    });
    const binding = obs.find((o) => o.name === "target_resource_matches");
    expect(binding?.verdict).toBe("failed");
    const ablated = withoutResourceBinding(obs);
    expect(ablated.every((o) => o.verdict === "passed")).toBe(true);
  });

  it("marks missing receipt as unknown, not fabricated failure", () => {
    const obs = evaluateTripEffectChecks(expected, {
      observedResourceId: "trip-a",
      receipt: null,
      savedFields: { destination: "BOS" },
      captureComplete: false,
    });
    expect(
      obs.find((o) => o.name === "original_command_receipt_matches")?.verdict,
    ).toBe("unknown");
    expect(obs.find((o) => o.name === "capture_complete")?.verdict).toBe("failed");
  });
});
