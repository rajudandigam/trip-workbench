/**
 * UI-synchronization observation helpers.
 * Compare declared expectations against DOM / network / database facts at a
 * deadline, then optionally after a repair refresh.
 */

export type SyncMethod = "dom" | "database" | "network" | "custom";
export type SyncVerdict = "passed" | "failed" | "unknown";

export type SyncFact = {
  name: string;
  verdict: SyncVerdict;
  method: SyncMethod;
  phase: "operation_deadline" | "after_repair";
  evidence: Record<string, unknown>;
  reason?: string;
};

export type UiSyncExpectation = {
  resourceId: string;
  /** Visible field values expected in the editor DOM at the deadline. */
  expectedDomFields: Record<string, string>;
  /** Saved field values expected in SQL at the deadline. */
  expectedSavedFields: Record<string, string>;
  expectedRevision: number;
  /** When true, a dirty refusal (no write) is the success criteria. */
  expectRefusal?: boolean;
  expectedErrorCode?: string;
};

export type UiSyncObservation = {
  resourceId?: string;
  domFields?: Record<string, string> | null;
  savedFields?: Record<string, string> | null;
  savedRevision?: number | null;
  patchCount?: number | null;
  appOk?: boolean | null;
  errorCode?: string | null;
  /** False when the observer was intentionally omitted. */
  observerPresent?: boolean;
};

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

export function evaluateUiSyncAtDeadline(
  expected: UiSyncExpectation,
  actual: UiSyncObservation,
  phase: SyncFact["phase"] = "operation_deadline",
): SyncFact[] {
  const facts: SyncFact[] = [];

  if (actual.observerPresent === false) {
    facts.push({
      name: "ui_fields_match",
      verdict: "unknown",
      method: "dom",
      phase,
      evidence: { expectedDomFields: expected.expectedDomFields },
      reason: "DOM observer missing",
    });
    facts.push({
      name: "saved_fields_match",
      verdict: "unknown",
      method: "database",
      phase,
      evidence: { expectedSavedFields: expected.expectedSavedFields },
      reason: "Database observer missing",
    });
    facts.push({
      name: "resource_binding",
      verdict: "unknown",
      method: "custom",
      phase,
      evidence: { intended: expected.resourceId },
      reason: "Observer missing",
    });
    return facts;
  }

  if (!actual.resourceId) {
    facts.push({
      name: "resource_binding",
      verdict: "unknown",
      method: "custom",
      phase,
      evidence: { intended: expected.resourceId },
      reason: "No observed resource id",
    });
  } else {
    facts.push({
      name: "resource_binding",
      verdict: actual.resourceId === expected.resourceId ? "passed" : "failed",
      method: "custom",
      phase,
      evidence: {
        intended: expected.resourceId,
        observed: actual.resourceId,
      },
    });
  }

  if (expected.expectRefusal) {
    const refused =
      actual.appOk === false &&
      actual.errorCode === (expected.expectedErrorCode ?? "USER_EDIT_IN_PROGRESS");
    facts.push({
      name: "mutation_refused",
      verdict: refused ? "passed" : "failed",
      method: "network",
      phase,
      evidence: {
        appOk: actual.appOk ?? null,
        errorCode: actual.errorCode ?? null,
        patchCount: actual.patchCount ?? null,
      },
    });
    facts.push({
      name: "no_write",
      verdict:
        actual.patchCount === 0 &&
        actual.savedRevision === expected.expectedRevision
          ? "passed"
          : actual.patchCount == null
            ? "unknown"
            : "failed",
      method: "database",
      phase,
      evidence: {
        patchCount: actual.patchCount ?? null,
        savedRevision: actual.savedRevision ?? null,
        expectedRevision: expected.expectedRevision,
      },
    });
    return facts;
  }

  if (actual.domFields == null) {
    facts.push({
      name: "ui_fields_match",
      verdict: "unknown",
      method: "dom",
      phase,
      evidence: { expectedDomFields: expected.expectedDomFields },
      reason: "DOM fields not observed",
    });
  } else {
    facts.push({
      name: "ui_fields_match",
      verdict: fieldsMatch(expected.expectedDomFields, actual.domFields)
        ? "passed"
        : "failed",
      method: "dom",
      phase,
      evidence: {
        expectedDomFields: expected.expectedDomFields,
        domFields: actual.domFields,
        savedFields: actual.savedFields ?? null,
      },
    });
  }

  if (actual.savedFields == null || actual.savedRevision == null) {
    facts.push({
      name: "saved_fields_match",
      verdict: "unknown",
      method: "database",
      phase,
      evidence: {
        expectedSavedFields: expected.expectedSavedFields,
        expectedRevision: expected.expectedRevision,
      },
      reason: "Saved row not observed",
    });
  } else {
    const fieldsOk = fieldsMatch(expected.expectedSavedFields, actual.savedFields);
    const revOk = actual.savedRevision === expected.expectedRevision;
    facts.push({
      name: "saved_fields_match",
      verdict: fieldsOk && revOk ? "passed" : "failed",
      method: "database",
      phase,
      evidence: {
        expectedSavedFields: expected.expectedSavedFields,
        expectedRevision: expected.expectedRevision,
        savedFields: actual.savedFields,
        savedRevision: actual.savedRevision,
      },
    });
  }

  // Stale-UI signal: DB matches while DOM does not (classic #553 class).
  if (actual.domFields && actual.savedFields) {
    const dbOk = fieldsMatch(expected.expectedSavedFields, actual.savedFields);
    const domOk = fieldsMatch(expected.expectedDomFields, actual.domFields);
    facts.push({
      name: "ui_matches_saved",
      verdict: dbOk && domOk ? "passed" : dbOk && !domOk ? "failed" : "unknown",
      method: "custom",
      phase,
      evidence: {
        domFields: actual.domFields,
        savedFields: actual.savedFields,
      },
      reason:
        dbOk && !domOk
          ? "Server committed but UI still shows pre-update values"
          : undefined,
    });
  }

  return facts;
}

/** True when deadline captured a stale-UI failure that repair should clear. */
export function isStaleUiAtDeadline(facts: readonly SyncFact[]): boolean {
  return facts.some(
    (f) =>
      f.phase === "operation_deadline" &&
      f.name === "ui_matches_saved" &&
      f.verdict === "failed",
  );
}
