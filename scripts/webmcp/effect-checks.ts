/**
 * Application-specific WebMCP effect checks.
 * Separates tool/app-reported results from independently observed effects.
 *
 * Expectations must be declared before execution. Do not populate expected
 * action/outcome/revision from the returned receipt.
 */

export type EffectVerdict = "passed" | "failed" | "unknown";

export type EffectObservationMethod =
  | "database"
  | "network"
  | "dom"
  | "custom";

export type EffectObservation = {
  name: string;
  verdict: EffectVerdict;
  method: EffectObservationMethod;
  /** Independent evidence references (receipt id, revision, field compare). */
  evidence: Record<string, unknown>;
  reason?: string;
};

export type TripEffectExpectation = {
  domain: "trip";
  intendedResourceId: string;
  commandId: string;
  /** Declared before execution — never copied from the returned receipt. */
  action: string;
  /** Allowed receipt outcomes for this scenario (e.g. ["applied"]). */
  expectedOutcomes: readonly string[];
  expectedFromRevision: number | null;
  expectedToRevision: number | null;
  expectedFields: Record<string, unknown>;
  /**
   * When set, local_edits_preserved compares the observed local buffer to this
   * declared human edit. When omitted, preservation is not required (verdict
   * stays unknown unless local observation is present without expectation).
   */
  expectedLocalEdit?: Record<string, unknown>;
  /** Names that must be observed for capture_complete to pass. */
  requiredObservations?: readonly string[];
};

export type TripEffectActual = {
  observedResourceId?: string;
  receipt?: {
    commandId: string;
    action: string;
    outcome: string;
    tripId?: string;
    fromRevision: number | null;
    toRevision: number | null;
  } | null;
  /** Independently read saved revision (SQL), not from the receipt alone. */
  savedRevision?: number | null;
  savedFields?: Record<string, unknown> | null;
  localFields?: Record<string, unknown> | null;
  /** True when a real DOM/local-buffer observation was collected. */
  localObserved?: boolean;
  submissions?: number | null;
  /** Which named facts were actually collected this run. */
  completedObservations?: readonly string[];
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
      method: "database",
      evidence: { intended: expected.intendedResourceId },
      reason: "No independently observed resource identity",
    });
  } else {
    out.push({
      name: "target_resource_matches",
      verdict:
        actual.observedResourceId === expected.intendedResourceId ? "passed" : "failed",
      method: "database",
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
      method: "network",
      evidence: { commandId: expected.commandId },
      reason: "Receipt not observed",
    });
  } else {
    const outcomeOk = expected.expectedOutcomes.includes(actual.receipt.outcome);
    const resourceOk =
      actual.receipt.tripId === undefined ||
      actual.receipt.tripId === expected.intendedResourceId;
    const match =
      actual.receipt.commandId === expected.commandId &&
      actual.receipt.action === expected.action &&
      outcomeOk &&
      resourceOk &&
      actual.receipt.fromRevision === expected.expectedFromRevision &&
      actual.receipt.toRevision === expected.expectedToRevision;
    out.push({
      name: "original_command_receipt_matches",
      verdict: match ? "passed" : "failed",
      method: "network",
      evidence: {
        expectedAction: expected.action,
        expectedOutcomes: expected.expectedOutcomes,
        expectedFrom: expected.expectedFromRevision,
        expectedTo: expected.expectedToRevision,
        intendedResourceId: expected.intendedResourceId,
        receipt: actual.receipt,
      },
      reason: match
        ? undefined
        : "Receipt command, action, outcome, resource, or revision mismatch",
    });
  }

  if (!actual.savedFields) {
    out.push({
      name: "requested_change_observed",
      verdict: "unknown",
      method: "database",
      evidence: { expectedFields: expected.expectedFields },
      reason: "Saved fields not observed",
    });
  } else {
    out.push({
      name: "requested_change_observed",
      verdict: fieldMatches(expected.expectedFields, actual.savedFields)
        ? "passed"
        : "failed",
      method: "database",
      evidence: {
        expectedFields: expected.expectedFields,
        savedFields: actual.savedFields,
      },
    });
  }

  // Independent DB revision claim — never pass without savedRevision.
  // Receipt transition remains on original_command_receipt_matches (network).
  if (
    expected.expectedFromRevision == null ||
    expected.expectedToRevision == null
  ) {
    out.push({
      name: "revision_semantics_match",
      verdict: "unknown",
      method: "database",
      evidence: {
        expectedFrom: expected.expectedFromRevision,
        expectedTo: expected.expectedToRevision,
      },
      reason: "Expected revision transition not declared",
    });
  } else if (actual.savedRevision == null) {
    out.push({
      name: "revision_semantics_match",
      verdict: "unknown",
      method: "database",
      evidence: {
        expectedFrom: expected.expectedFromRevision,
        expectedTo: expected.expectedToRevision,
        receipt: actual.receipt ?? null,
        savedRevision: null,
      },
      reason: "Independent saved revision not observed",
    });
  } else {
    const savedOk = actual.savedRevision === expected.expectedToRevision;
    // Contradictory receipt still fails even when DB matches.
    const receiptContradicts =
      actual.receipt != null &&
      (actual.receipt.fromRevision !== expected.expectedFromRevision ||
        actual.receipt.toRevision !== expected.expectedToRevision ||
        !expected.expectedOutcomes.includes(actual.receipt.outcome));
    out.push({
      name: "revision_semantics_match",
      verdict: savedOk && !receiptContradicts ? "passed" : "failed",
      method: "database",
      evidence: {
        expectedFrom: expected.expectedFromRevision,
        expectedTo: expected.expectedToRevision,
        expectedOutcomes: expected.expectedOutcomes,
        receipt: actual.receipt ?? null,
        savedRevision: actual.savedRevision,
      },
      reason: receiptContradicts
        ? "Receipt contradicts declared revision/outcome transition"
        : savedOk
          ? undefined
          : "Independent saved revision does not match expectedToRevision",
    });
  }

  if (expected.expectedLocalEdit) {
    if (!actual.localObserved || !actual.localFields) {
      out.push({
        name: "local_edits_preserved",
        verdict: "unknown",
        method: "dom",
        evidence: { expectedLocalEdit: expected.expectedLocalEdit },
        reason: "Local buffer was not independently observed",
      });
    } else {
      out.push({
        name: "local_edits_preserved",
        verdict: fieldMatches(expected.expectedLocalEdit, actual.localFields)
          ? "passed"
          : "failed",
        method: "dom",
        evidence: {
          expectedLocalEdit: expected.expectedLocalEdit,
          localFields: actual.localFields,
          savedFields: actual.savedFields ?? null,
        },
      });
    }
  } else if (actual.localObserved && actual.localFields) {
    out.push({
      name: "local_edits_preserved",
      verdict: "unknown",
      method: "dom",
      evidence: { localFields: actual.localFields },
      reason: "Local buffer observed but no expectedLocalEdit was declared",
    });
  } else {
    out.push({
      name: "local_edits_preserved",
      verdict: "unknown",
      method: "dom",
      evidence: {},
      reason: "Preservation not required for this scenario; browser local not claimed",
    });
  }

  if (actual.submissions == null) {
    out.push({
      name: "no_unintended_submission",
      verdict: "unknown",
      method: "database",
      evidence: {},
    });
  } else {
    out.push({
      name: "no_unintended_submission",
      verdict: actual.submissions === 0 ? "passed" : "failed",
      method: "database",
      evidence: { submissions: actual.submissions },
    });
  }

  const required = expected.requiredObservations ?? [
    "target_resource_matches",
    "original_command_receipt_matches",
    "requested_change_observed",
    "revision_semantics_match",
    "no_unintended_submission",
  ];
  const completed = new Set(actual.completedObservations ?? []);
  const missingRequired = required.filter((name) => !completed.has(name));
  out.push({
    name: "capture_complete",
    verdict: missingRequired.length === 0 ? "passed" : "failed",
    method: "custom",
    evidence: {
      required,
      completed: [...completed],
      missingRequired,
    },
    reason:
      missingRequired.length === 0
        ? undefined
        : `Missing required observations: ${missingRequired.join(", ")}`,
  });

  return out;
}

/** Ablation helper for tests: remove resource-binding assertion. */
export function withoutResourceBinding(
  observations: readonly EffectObservation[],
): EffectObservation[] {
  return observations.filter((o) => o.name !== "target_resource_matches");
}

/** Derive completed observation names that have a non-unknown verdict source. */
export function completedFromActual(actual: TripEffectActual): string[] {
  const names: string[] = [];
  if (actual.observedResourceId) names.push("target_resource_matches");
  if (actual.receipt) names.push("original_command_receipt_matches");
  if (actual.savedFields) names.push("requested_change_observed");
  if (actual.savedRevision != null) {
    names.push("revision_semantics_match");
  }
  if (actual.localObserved && actual.localFields) {
    names.push("local_edits_preserved");
  }
  if (actual.submissions != null) names.push("no_unintended_submission");
  return names;
}
