/**
 * Application-specific WebMCP effect checks.
 * Separates tool/app-reported results from independently observed effects.
 */

export type EffectVerdict = "passed" | "failed" | "unknown";

export type EffectObservation = {
  name: string;
  verdict: EffectVerdict;
  /** Independent evidence references (receipt id, revision, field compare). */
  evidence: Record<string, unknown>;
  reason?: string;
};

export type TripEffectExpectation = {
  domain: "trip";
  intendedResourceId: string;
  commandId: string;
  action: string;
  expectedFromRevision: number | null;
  expectedToRevision: number | null;
  expectedFields: Record<string, unknown>;
};

export type TripEffectActual = {
  observedResourceId?: string;
  receipt?: {
    commandId: string;
    action: string;
    outcome: string;
    fromRevision: number | null;
    toRevision: number | null;
  } | null;
  savedFields?: Record<string, unknown> | null;
  localFields?: Record<string, unknown> | null;
  submissions?: number | null;
  captureComplete?: boolean;
};

function fieldMatches(
  expected: Record<string, unknown>,
  actual: Record<string, unknown> | null | undefined,
): boolean {
  if (!actual) return false;
  for (const [key, value] of Object.entries(expected)) {
    if (actual[key] !== value) return false;
  }
  return true;
}

export function evaluateTripEffectChecks(
  expected: TripEffectExpectation,
  actual: TripEffectActual,
): EffectObservation[] {
  const out: EffectObservation[] = [];

  if (!actual.observedResourceId) {
    out.push({
      name: "target_resource_matches",
      verdict: "unknown",
      evidence: { intended: expected.intendedResourceId },
      reason: "No independently observed resource identity",
    });
  } else {
    out.push({
      name: "target_resource_matches",
      verdict:
        actual.observedResourceId === expected.intendedResourceId ? "passed" : "failed",
      evidence: {
        intended: expected.intendedResourceId,
        observed: actual.observedResourceId,
      },
    });
  }

  if (!actual.receipt) {
    out.push({
      name: "original_command_receipt_matches",
      verdict: "unknown",
      evidence: { commandId: expected.commandId },
      reason: "Receipt not observed",
    });
  } else {
    const match =
      actual.receipt.commandId === expected.commandId &&
      actual.receipt.action === expected.action &&
      actual.receipt.fromRevision === expected.expectedFromRevision &&
      actual.receipt.toRevision === expected.expectedToRevision;
    out.push({
      name: "original_command_receipt_matches",
      verdict: match ? "passed" : "failed",
      evidence: { expected, receipt: actual.receipt },
    });
  }

  if (!actual.savedFields) {
    out.push({
      name: "requested_change_observed",
      verdict: "unknown",
      evidence: { expectedFields: expected.expectedFields },
      reason: "Saved fields not observed",
    });
  } else {
    out.push({
      name: "requested_change_observed",
      verdict: fieldMatches(expected.expectedFields, actual.savedFields)
        ? "passed"
        : "failed",
      evidence: {
        expectedFields: expected.expectedFields,
        savedFields: actual.savedFields,
      },
    });
  }

  if (
    expected.expectedFromRevision == null ||
    expected.expectedToRevision == null ||
    !actual.receipt
  ) {
    out.push({
      name: "revision_semantics_match",
      verdict: actual.receipt ? "failed" : "unknown",
      evidence: {
        expectedFrom: expected.expectedFromRevision,
        expectedTo: expected.expectedToRevision,
        receipt: actual.receipt ?? null,
      },
    });
  } else {
    out.push({
      name: "revision_semantics_match",
      verdict:
        actual.receipt.fromRevision === expected.expectedFromRevision &&
        actual.receipt.toRevision === expected.expectedToRevision
          ? "passed"
          : "failed",
      evidence: {
        expectedFrom: expected.expectedFromRevision,
        expectedTo: expected.expectedToRevision,
        receipt: actual.receipt,
      },
    });
  }

  if (!actual.localFields) {
    out.push({
      name: "local_edits_preserved",
      verdict: "unknown",
      evidence: {},
      reason: "Local buffer not observed",
    });
  } else {
    // Presence of local purpose distinct from saved purpose is the recovery signal.
    const localPurpose = actual.localFields.purpose;
    const savedPurpose = actual.savedFields?.purpose;
    out.push({
      name: "local_edits_preserved",
      verdict:
        localPurpose !== undefined && localPurpose !== savedPurpose
          ? "passed"
          : localPurpose === undefined
            ? "unknown"
            : "failed",
      evidence: { localPurpose, savedPurpose },
    });
  }

  if (actual.submissions == null) {
    out.push({
      name: "no_unintended_submission",
      verdict: "unknown",
      evidence: {},
    });
  } else {
    out.push({
      name: "no_unintended_submission",
      verdict: actual.submissions === 0 ? "passed" : "failed",
      evidence: { submissions: actual.submissions },
    });
  }

  out.push({
    name: "capture_complete",
    verdict: actual.captureComplete === true ? "passed" : actual.captureComplete === false ? "failed" : "unknown",
    evidence: { captureComplete: actual.captureComplete ?? null },
  });

  return out;
}

/** Ablation helper for tests: remove resource-binding assertion. */
export function withoutResourceBinding(
  observations: readonly EffectObservation[],
): EffectObservation[] {
  return observations.filter((o) => o.name !== "target_resource_matches");
}
