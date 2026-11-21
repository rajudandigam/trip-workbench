/**
 * Pure finalization for the native UI-sync matrix.
 * Ensures incomplete / errored runs cannot report exit 0 or native=pass.
 */

export const EXPECTED_UI_SYNC_CASE_IDS = [
  "healthy-update",
  "stale-ui-then-repair",
  "missing-observer",
  "wrong-resource",
  "dirty-refusal",
] as const;

export type UiSyncCaseId = (typeof EXPECTED_UI_SYNC_CASE_IDS)[number];

export type UiSyncCaseStatus = "pass" | "fail" | "not_run" | "blocked";

export type UiSyncCaseReport = {
  id: UiSyncCaseId;
  status: UiSyncCaseStatus;
  reason?: string;
  [key: string]: unknown;
};

export type MaterializeUiSyncInput = {
  reported: readonly UiSyncCaseReport[];
  /** Case that was in progress when a runtime error occurred. */
  activeCaseId?: UiSyncCaseId | null;
  fatalError?: string | null;
  finalizationError?: string | null;
  /** Reason used for cases that never started (defaults from fatalError). */
  incompleteReason?: string;
};

export type UiSyncMatrixResult = {
  cases: UiSyncCaseReport[];
  exitCode: number;
  ok: boolean;
  native: "pass" | "fail" | "not_run";
  note: string;
  duplicateIds: UiSyncCaseId[];
  fatalError: string | null;
  finalizationError: string | null;
};

function isExpectedId(id: string): id is UiSyncCaseId {
  return (EXPECTED_UI_SYNC_CASE_IDS as readonly string[]).includes(id);
}

/**
 * Account for every expected case exactly once.
 * Runtime/finalization errors force nonpass; missing cases become not_run.
 */
export function materializeUiSyncCases(
  input: MaterializeUiSyncInput,
): UiSyncCaseReport[] {
  const byId = new Map<UiSyncCaseId, UiSyncCaseReport>();
  const duplicates: UiSyncCaseId[] = [];

  for (const report of input.reported) {
    if (!isExpectedId(report.id)) continue;
    if (byId.has(report.id)) {
      duplicates.push(report.id);
      continue;
    }
    byId.set(report.id, { ...report });
  }

  const fatal = input.fatalError?.trim() || null;
  const incompleteReason =
    input.incompleteReason?.trim() ||
    fatal ||
    "Case did not execute";

  if (input.activeCaseId && fatal) {
    const existing = byId.get(input.activeCaseId);
    byId.set(input.activeCaseId, {
      ...(existing ?? { id: input.activeCaseId }),
      id: input.activeCaseId,
      status: "fail",
      reason: fatal,
    });
  }

  const out: UiSyncCaseReport[] = [];
  for (const id of EXPECTED_UI_SYNC_CASE_IDS) {
    const existing = byId.get(id);
    if (existing) {
      if (duplicates.includes(id)) {
        out.push({
          ...existing,
          status: "fail",
          reason: existing.reason
            ? `${existing.reason}; duplicate case id reported`
            : "Duplicate case id reported",
        });
      } else {
        out.push(existing);
      }
      continue;
    }
    out.push({
      id,
      status: fatal && input.activeCaseId === id ? "fail" : "not_run",
      reason:
        fatal && input.activeCaseId === id
          ? fatal
          : incompleteReason,
    });
  }

  return out;
}

export function exitCodeFromUiSyncMatrix(
  cases: readonly UiSyncCaseReport[],
  options?: {
    fatalError?: string | null;
    finalizationError?: string | null;
    duplicateIds?: readonly string[];
  },
): { exitCode: number; ok: boolean; native: "pass" | "fail" | "not_run"; note: string } {
  const fatal = options?.fatalError?.trim() || null;
  const finalization = options?.finalizationError?.trim() || null;
  const duplicates = options?.duplicateIds ?? [];

  const expectedSet = new Set<string>(EXPECTED_UI_SYNC_CASE_IDS);
  const seen = new Set<string>();
  let hasFail = false;
  let hasIncomplete = false;
  let hasPass = false;

  for (const c of cases) {
    if (!expectedSet.has(c.id)) {
      hasFail = true;
      continue;
    }
    if (seen.has(c.id)) {
      hasFail = true;
    }
    seen.add(c.id);
    if (c.status === "fail") hasFail = true;
    if (c.status === "not_run" || c.status === "blocked") hasIncomplete = true;
    if (c.status === "pass") hasPass = true;
  }

  const missingExpected = EXPECTED_UI_SYNC_CASE_IDS.some((id) => !seen.has(id));
  if (missingExpected || duplicates.length > 0) hasFail = true;
  if (fatal || finalization) hasFail = true;

  const allFivePass =
    cases.length === EXPECTED_UI_SYNC_CASE_IDS.length &&
    EXPECTED_UI_SYNC_CASE_IDS.every((id) => {
      const c = cases.find((x) => x.id === id);
      return c?.status === "pass";
    }) &&
    !fatal &&
    !finalization &&
    duplicates.length === 0;

  let exitCode: number;
  let native: "pass" | "fail" | "not_run";
  let note: string;

  if (allFivePass) {
    exitCode = 0;
    native = "pass";
    note = "Native UI-sync matrix passed with per-op + repair observations.";
  } else if (hasFail) {
    exitCode = 1;
    native = "fail";
    note = finalization
      ? `Writer/artifact finalization failed: ${finalization}`
      : fatal
        ? `Runtime failure: ${fatal}`
        : "One or more UI-sync cases failed assertions or matrix accounting.";
  } else if (hasIncomplete || !hasPass) {
    exitCode = 2;
    native = "not_run";
    note = "Native UI-sync not fully executed — do not claim success.";
  } else {
    exitCode = 2;
    native = "not_run";
    note = "Native UI-sync matrix incomplete — do not claim success.";
  }

  return { exitCode, ok: exitCode === 0, native, note };
}

export function finalizeUiSyncMatrix(
  input: MaterializeUiSyncInput,
): UiSyncMatrixResult {
  const duplicateIds: UiSyncCaseId[] = [];
  const seen = new Set<UiSyncCaseId>();
  for (const r of input.reported) {
    if (!isExpectedId(r.id)) continue;
    if (seen.has(r.id)) duplicateIds.push(r.id);
    else seen.add(r.id);
  }

  const cases = materializeUiSyncCases(input);
  const scored = exitCodeFromUiSyncMatrix(cases, {
    fatalError: input.fatalError,
    finalizationError: input.finalizationError,
    duplicateIds,
  });

  return {
    cases,
    ...scored,
    duplicateIds,
    fatalError: input.fatalError?.trim() || null,
    finalizationError: input.finalizationError?.trim() || null,
  };
}
