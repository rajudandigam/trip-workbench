import type {
  CommandReceipt,
  TripFields,
  TripPatch,
  TripView,
  ValidationResult,
} from "../../domain/types.js";
import { fieldsEqual } from "../../domain/trip-rules.js";
import { isStaleOp, mergeAfterInFlightEdit, type AsyncOpContext } from "../../domain/async-result.js";
import { api, getCsrfToken, newCommandId, setCsrfToken } from "./api.js";

export type SessionInfo = {
  email: string;
  displayName: string;
  role: "traveler" | "observer";
  tenantId: string;
  csrfToken: string;
  capabilities: { canMutateTrips: boolean; aiMode: string };
};

export type PendingOutcome = {
  draftId: string;
  commandId: string;
  sessionGeneration: number;
  editorGeneration: number;
};

export type EditorState = {
  savedDraft: TripView | null;
  localFields: TripFields | null;
  editVersion: number;
  brief: string;
  briefVersion: number;
  dirty: boolean;
  saving: boolean;
  message: string | null;
  generation: number;
  sessionGeneration: number;
  editorGeneration: number;
  signingOut: boolean;
  pendingOutcome: PendingOutcome | null;
  proposalBinding: {
    draftId: string;
    boundRevision: number;
    boundClientEditVersion: number;
    boundBriefVersion: number;
    sessionGeneration: number;
    editorGeneration: number;
  } | null;
};

type Fail = { ok: false; error: { code: string; message: string; [key: string]: unknown } };
type Ok<T> = { ok: true; data: T };

function diffPatch(saved: TripFields, local: TripFields): TripPatch {
  const patch: TripPatch = {};
  (Object.keys(saved) as Array<keyof TripFields>).forEach((key) => {
    if (saved[key] !== local[key]) {
      patch[key] = local[key] as never;
    }
  });
  return patch;
}

function fail(code: string, message: string, extra: Record<string, unknown> = {}): Fail {
  return { ok: false, error: { code, message, ...extra } };
}

export function createCoordinator(deps: { fetchImpl?: typeof api } = {}) {
  const request = deps.fetchImpl || api;
  let sessionGeneration = 0;
  let editorGeneration = 0;
  let operationSeq = 0;
  let activeOperationId: number | null = null;
  let openDraftRequestId = 0;

  let state: EditorState = {
    savedDraft: null,
    localFields: null,
    editVersion: 0,
    brief: "",
    briefVersion: 0,
    dirty: false,
    saving: false,
    message: null,
    generation: 0,
    sessionGeneration: 0,
    editorGeneration: 0,
    signingOut: false,
    pendingOutcome: null,
    proposalBinding: null,
  };
  const listeners = new Set<() => void>();

  function emit() {
    for (const l of listeners) l();
  }

  function setState(partial: Partial<EditorState>) {
    state = {
      ...state,
      ...partial,
      generation: sessionGeneration,
      sessionGeneration,
      editorGeneration,
    };
    emit();
  }

  function currentGuard() {
    return {
      sessionGeneration,
      editorGeneration,
      draftId: state.savedDraft?.id ?? null,
      activeOperationId,
    };
  }

  function beginOperation(): number {
    operationSeq += 1;
    activeOperationId = operationSeq;
    return operationSeq;
  }

  function endOperation(operationId: number) {
    if (activeOperationId === operationId) {
      activeOperationId = null;
      setState({ saving: false });
    }
  }

  function captureOp(draftId: string, expectedRevision: number): AsyncOpContext {
    if (!state.localFields || !state.savedDraft) {
      throw new Error("No draft open");
    }
    return {
      sessionGeneration,
      editorGeneration,
      draftId,
      operationId: beginOperation(),
      expectedRevision,
      editVersionAtDispatch: state.editVersion,
      localAtDispatch: { ...state.localFields },
      savedAtDispatch: { ...state.savedDraft.fields },
    };
  }

  function applyConfirmedMutation(
    ctx: AsyncOpContext,
    receipt: {
      toRevision: number | null;
      fields?: TripFields;
      tripId: string;
      outcome: string;
    },
  ): Fail | Ok<typeof receipt> {
    if (isStaleOp(ctx, currentGuard())) {
      endOperation(ctx.operationId);
      return fail("CONTEXT_MISMATCH", "Result ignored because the editor context changed.");
    }
    if (!state.savedDraft || state.savedDraft.id !== ctx.draftId || !state.localFields) {
      endOperation(ctx.operationId);
      return fail("CONTEXT_MISMATCH", "Draft is no longer open.");
    }

    // Historical receipt must not regress newer UI state.
    if (
      receipt.toRevision != null &&
      receipt.toRevision < state.savedDraft.revision &&
      receipt.fields
    ) {
      endOperation(ctx.operationId);
      setState({
        message:
          "Received a historical command receipt. Current saved state was left unchanged; local edits were preserved.",
      });
      return { ok: true, data: receipt };
    }

    if (!receipt.fields) {
      endOperation(ctx.operationId);
      return fail("INVALID_RESPONSE", "Mutation receipt lacked fields.");
    }

    const editedDuring = state.editVersion !== ctx.editVersionAtDispatch;
    const savedDraft: TripView = {
      ...state.savedDraft,
      revision: receipt.toRevision ?? state.savedDraft.revision,
      fields: receipt.fields,
    };

    if (!editedDuring) {
      setState({
        savedDraft,
        localFields: { ...receipt.fields },
        dirty: false,
        message: null,
        pendingOutcome: null,
      });
      endOperation(ctx.operationId);
      return { ok: true, data: receipt };
    }

    const merged = mergeAfterInFlightEdit({
      savedAtDispatch: ctx.savedAtDispatch,
      localAtDispatch: ctx.localAtDispatch,
      localNow: state.localFields,
      serverFields: receipt.fields,
    });
    const overlapNote = merged.overlapped.length
      ? ` Overlapping fields kept locally: ${merged.overlapped.join(", ")}.`
      : "";
    setState({
      savedDraft,
      localFields: merged.localFields,
      dirty: merged.dirty,
      message: `Saved state advanced while you were editing. Newer local edits were kept.${overlapNote}`,
      pendingOutcome: null,
    });
    endOperation(ctx.operationId);
    return { ok: true, data: receipt };
  }

  async function reconcileCommand(
    draftId: string,
    commandId: string,
    ctx: AsyncOpContext,
  ): Promise<Fail | Ok<CommandReceipt>> {
    const recovery = new AbortController();
    const deadline = Date.now() + 1500;
    let attempts = 0;
    while (Date.now() < deadline && attempts < 5) {
      attempts += 1;
      if (isStaleOp(ctx, currentGuard())) {
        return fail("CONTEXT_MISMATCH", "Recovery aborted after context change.");
      }
      const res = await request<CommandReceipt>(`/api/trips/${draftId}/commands/${commandId}`, {
        signal: recovery.signal,
      });
      if (res.ok) {
        return applyConfirmedMutation(ctx, res.data) as Fail | Ok<CommandReceipt>;
      }
      if (res.error.code === "UNAUTHENTICATED") {
        return fail("UNAUTHENTICATED", res.error.message);
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    setState({
      pendingOutcome: {
        draftId,
        commandId,
        sessionGeneration: ctx.sessionGeneration,
        editorGeneration: ctx.editorGeneration,
      },
      message:
        "We could not confirm whether this change saved. Use Recheck outcome before retrying a mutation.",
    });
    endOperation(ctx.operationId);
    return fail("OUTCOME_UNKNOWN", "Could not confirm mutation outcome.", {
      commandId,
      draftId,
      retry: "recheck_outcome",
    });
  }

  return {
    subscribe(fn: () => void): () => void {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    getState() {
      return state;
    },
    enterEditor(_draftId: string) {
      setState({
        proposalBinding: null,
        message: null,
      });
    },
    leaveEditor() {
      editorGeneration += 1;
      activeOperationId = null;
      setState({
        editorGeneration,
        savedDraft: null,
        localFields: null,
        dirty: false,
        saving: false,
        brief: "",
        briefVersion: 0,
        proposalBinding: null,
        // pendingOutcome is draft-scoped; clear on leave to avoid cross-draft recovery
        pendingOutcome: null,
        message: null,
      });
    },
    bumpGeneration() {
      sessionGeneration += 1;
      editorGeneration += 1;
      activeOperationId = null;
      setState({
        savedDraft: null,
        localFields: null,
        dirty: false,
        saving: false,
        message: null,
        brief: "",
        briefVersion: 0,
        proposalBinding: null,
        pendingOutcome: null,
        signingOut: false,
      });
    },
    async loadSession() {
      const res = await request<SessionInfo>("/api/session");
      if (res.ok) setCsrfToken(res.data.csrfToken);
      return res;
    },
    async login(email: string, password: string) {
      const res = await request<SessionInfo>("/api/session", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) {
        sessionGeneration += 1;
        editorGeneration += 1;
        setCsrfToken(res.data.csrfToken);
        setState({
          savedDraft: null,
          localFields: null,
          dirty: false,
          proposalBinding: null,
          pendingOutcome: null,
        });
      }
      return res;
    },
    async logout() {
      if (state.signingOut) {
        return fail("COMMAND_IN_PROGRESS", "Sign-out already in progress.");
      }
      const tokenAtStart = getCsrfToken();
      if (!tokenAtStart) {
        return fail("UNAUTHENTICATED", "No active CSRF token; session may already be gone.");
      }
      setState({ signingOut: true, message: null });
      // Invalidate pending result application without clearing CSRF yet.
      const logoutSessionGen = sessionGeneration;
      editorGeneration += 1;
      activeOperationId = null;

      const res = await request<{ signedOut: boolean }>("/api/session", { method: "DELETE" });
      if (!res.ok) {
        // Expired session: treat as signed out if server says unauthenticated.
        if (res.error.code === "UNAUTHENTICATED") {
          sessionGeneration += 1;
          setCsrfToken(null);
          setState({
            signingOut: false,
            savedDraft: null,
            localFields: null,
            dirty: false,
            saving: false,
            proposalBinding: null,
            pendingOutcome: null,
            message: null,
          });
          return { ok: true as const, data: { signedOut: true, alreadyExpired: true } };
        }
        setState({
          signingOut: false,
          message: res.error.message || "Sign-out failed. You may still be signed in.",
        });
        return res;
      }
      if (sessionGeneration !== logoutSessionGen) {
        // Another login happened; do not clear the new session.
        setState({ signingOut: false });
        return fail("CONTEXT_MISMATCH", "Session changed during sign-out.");
      }
      sessionGeneration += 1;
      setCsrfToken(null);
      setState({
        signingOut: false,
        savedDraft: null,
        localFields: null,
        dirty: false,
        saving: false,
        proposalBinding: null,
        pendingOutcome: null,
        message: null,
        brief: "",
        briefVersion: 0,
      });
      return res;
    },
    async listTrips() {
      return request<TripView[]>("/api/trips");
    },
    async createTrip() {
      return request<{ tripId: string; toRevision: number }>("/api/trips", {
        method: "POST",
        body: JSON.stringify({ commandId: newCommandId() }),
      });
    },
    async openDraft(id: string) {
      // Same-draft reopen uses request ordering only. Changing draft identity
      // (or leaveEditor/logout) advances editorGeneration and invalidates in-flight ops.
      const previousId = state.savedDraft?.id ?? null;
      if (previousId !== id) {
        editorGeneration += 1;
      }
      const requestId = ++openDraftRequestId;
      const gen = editorGeneration;
      setState({
        proposalBinding: null,
        pendingOutcome: state.pendingOutcome?.draftId === id ? state.pendingOutcome : null,
      });
      const res = await request<TripView>(`/api/trips/${id}`);
      if (requestId !== openDraftRequestId || gen !== editorGeneration) {
        return fail("CONTEXT_MISMATCH", "Ignored superseded draft load.");
      }
      if (!res.ok) {
        if (res.error.code === "UNAUTHENTICATED") {
          return res;
        }
        return res;
      }
      setState({
        savedDraft: res.data,
        localFields: { ...res.data.fields },
        dirty: false,
        editVersion: 0,
        brief: "",
        briefVersion: 0,
        message: null,
        proposalBinding: null,
      });
      return res;
    },
    /**
     * Refresh authorized saved state without discarding local unsaved edits.
     * Used by get_trip_draft so cross-tab revisions are visible.
     */
    async refreshSavedDraft(draftId: string) {
      if (state.signingOut) {
        return fail("FORBIDDEN", "Sign-out in progress.");
      }
      if (!state.savedDraft || state.savedDraft.id !== draftId || !state.localFields) {
        return fail("CONTEXT_MISMATCH", "Open the requested draft first.");
      }
      const ctxDraft = draftId;
      const editVersion = state.editVersion;
      const localNow = { ...state.localFields };
      const savedBefore = { ...state.savedDraft.fields };
      const sessionGen = sessionGeneration;
      const editorGen = editorGeneration;

      const res = await request<TripView>(`/api/trips/${ctxDraft}`);
      if (sessionGen !== sessionGeneration || editorGen !== editorGeneration) {
        return fail("CONTEXT_MISMATCH", "Editor context changed during refresh.");
      }
      if (!res.ok) {
        return res;
      }
      if (!state.savedDraft || state.savedDraft.id !== ctxDraft) {
        return fail("CONTEXT_MISMATCH", "Draft is no longer open.");
      }

      const localCurrent = state.localFields ? { ...state.localFields } : localNow;
      const hadLocalEdits =
        !fieldsEqual(localNow, savedBefore) || !fieldsEqual(localCurrent, savedBefore);
      const finalMerge = mergeAfterInFlightEdit({
        savedAtDispatch: savedBefore,
        localAtDispatch: localNow,
        localNow: localCurrent,
        serverFields: res.data.fields,
      });
      const nextLocal = hadLocalEdits ? finalMerge.localFields : { ...res.data.fields };
      const nextDirty = hadLocalEdits
        ? !fieldsEqual(nextLocal, res.data.fields)
        : false;
      void editVersion;
      setState({
        savedDraft: { ...res.data },
        localFields: nextLocal,
        dirty: nextDirty,
      });
      return {
        ok: true as const,
        data: {
          id: res.data.id,
          revision: res.data.revision,
          status: res.data.status,
          fields: res.data.fields,
          hasUnsavedChanges: nextDirty,
        },
      };
    },
    updateLocalField<K extends keyof TripFields>(key: K, value: TripFields[K]) {
      if (!state.localFields || !state.savedDraft) return;
      const localFields = { ...state.localFields, [key]: value };
      setState({
        localFields,
        editVersion: state.editVersion + 1,
        dirty: !fieldsEqual(localFields, state.savedDraft.fields),
      });
    },
    updateBrief(brief: string) {
      setState({ brief, briefVersion: state.briefVersion + 1 });
    },
    discardLocal() {
      if (!state.savedDraft) return;
      setState({
        localFields: { ...state.savedDraft.fields },
        dirty: false,
        editVersion: state.editVersion + 1,
        message: null,
      });
    },
    hasUnsavedChanges() {
      return state.dirty;
    },
    async saveManualPatch(opts?: { signal?: AbortSignal }) {
      if (state.signingOut) return fail("FORBIDDEN", "Sign-out in progress.");
      if (!state.savedDraft || !state.localFields || !state.dirty) return null;
      if (state.pendingOutcome) {
        return fail(
          "OUTCOME_UNKNOWN",
          "Resolve the previous uncertain mutation before saving.",
          { commandId: state.pendingOutcome.commandId },
        );
      }
      if (state.saving) {
        return fail("COMMAND_IN_PROGRESS", "A save is already in progress.");
      }
      if (opts?.signal?.aborted) {
        return fail("CANCELLED", "Save cancelled before dispatch.");
      }

      const draftId = state.savedDraft.id;
      const ctx = captureOp(draftId, state.savedDraft.revision);
      const patch = diffPatch(ctx.savedAtDispatch, ctx.localAtDispatch);
      const commandId = newCommandId();
      setState({ saving: true, message: null });

      if (opts?.signal?.aborted) {
        endOperation(ctx.operationId);
        return fail("CANCELLED", "Save cancelled before dispatch.");
      }

      const res = await request<{
        outcome: string;
        toRevision: number;
        fields: TripFields;
        tripId: string;
      }>(`/api/trips/${draftId}`, {
        method: "PATCH",
        body: JSON.stringify({
          expectedRevision: ctx.expectedRevision,
          commandId,
          patch,
        }),
        signal: opts?.signal,
      });

      if (isStaleOp(ctx, currentGuard())) {
        endOperation(ctx.operationId);
        return fail("CONTEXT_MISMATCH", "Save result ignored after context change.");
      }

      if (!res.ok) {
        if (res.error.code === "ABORTED" || res.error.code === "NETWORK_ERROR") {
          return reconcileCommand(draftId, commandId, ctx);
        }
        endOperation(ctx.operationId);
        setState({ message: res.error.message });
        return res;
      }
      return applyConfirmedMutation(ctx, res.data);
    },
    async applyAgentPatch(
      patch: TripPatch,
      expectedRevision: number,
      commandId: string,
      opts?: { signal?: AbortSignal },
    ) {
      if (state.signingOut) {
        return fail("FORBIDDEN", "Sign-out in progress.");
      }
      if (!state.savedDraft || !state.localFields) {
        return fail("NOT_FOUND", "No draft open.");
      }
      if (state.dirty) {
        return fail(
          "USER_EDIT_IN_PROGRESS",
          "Save or discard local edits before an agent update.",
        );
      }
      if (state.saving || activeOperationId != null) {
        return fail("COMMAND_IN_PROGRESS", "A save is already in progress.");
      }
      if (state.pendingOutcome) {
        return fail("OUTCOME_UNKNOWN", "Resolve the previous uncertain mutation first.", {
          commandId: state.pendingOutcome.commandId,
        });
      }
      if (opts?.signal?.aborted) {
        return fail("CANCELLED", "Update cancelled before dispatch.");
      }

      const draftId = state.savedDraft.id;
      const ctx = captureOp(draftId, expectedRevision);
      setState({ saving: true, message: null });

      if (opts?.signal?.aborted) {
        endOperation(ctx.operationId);
        return fail("CANCELLED", "Update cancelled before dispatch.");
      }

      const res = await request<{
        outcome: string;
        toRevision: number;
        fields: TripFields;
        tripId: string;
        commandId: string;
      }>(`/api/trips/${draftId}`, {
        method: "PATCH",
        body: JSON.stringify({ expectedRevision, commandId, patch }),
        signal: opts?.signal,
      });

      if (isStaleOp(ctx, currentGuard())) {
        endOperation(ctx.operationId);
        return fail("CONTEXT_MISMATCH", "Update result ignored after context change.");
      }

      if (!res.ok) {
        if (res.error.code === "ABORTED" || res.error.code === "NETWORK_ERROR") {
          return reconcileCommand(draftId, commandId, ctx);
        }
        endOperation(ctx.operationId);
        setState({ message: res.error.message });
        return res;
      }
      return applyConfirmedMutation(ctx, res.data);
    },
    async validateSaved() {
      if (!state.savedDraft) return null;
      return request<ValidationResult>(`/api/trips/${state.savedDraft.id}/validate`, {
        method: "POST",
        body: JSON.stringify({ expectedRevision: state.savedDraft.revision }),
      });
    },
    async validateAtRevision(draftId: string, expectedRevision: number) {
      if (!state.savedDraft || state.savedDraft.id !== draftId) {
        return fail("CONTEXT_MISMATCH", "Open the requested draft first.");
      }
      return request<ValidationResult>(`/api/trips/${draftId}/validate`, {
        method: "POST",
        body: JSON.stringify({ expectedRevision }),
      });
    },
    async requestProposal() {
      if (!state.savedDraft) return null;
      const draftId = state.savedDraft.id;
      const sessionGen = sessionGeneration;
      const editorGen = editorGeneration;
      const res = await request<{
        proposal: {
          patch: TripPatch;
          clarifications: Array<{ field: string | null; kind: string; question: string }>;
        };
        boundRevision: number;
        boundClientEditVersion: number;
        boundBriefVersion: number;
        mode: string;
      }>(`/api/trips/${draftId}/proposal`, {
        method: "POST",
        body: JSON.stringify({
          brief: state.brief,
          expectedRevision: state.savedDraft.revision,
          clientEditVersion: state.editVersion,
          briefVersion: state.briefVersion,
        }),
      });
      if (!res.ok) return res;
      if (
        sessionGen !== sessionGeneration ||
        editorGen !== editorGeneration ||
        state.savedDraft?.id !== draftId
      ) {
        return fail("CONTEXT_MISMATCH", "Proposal discarded after context change.");
      }
      setState({
        proposalBinding: {
          draftId,
          boundRevision: res.data.boundRevision,
          boundClientEditVersion: res.data.boundClientEditVersion,
          boundBriefVersion: res.data.boundBriefVersion,
          sessionGeneration: sessionGen,
          editorGeneration: editorGen,
        },
      });
      return res;
    },
    isProposalStale(bound: {
      boundRevision: number;
      boundClientEditVersion: number;
      boundBriefVersion: number;
    }) {
      if (!state.savedDraft || !state.proposalBinding) return true;
      if (state.proposalBinding.draftId !== state.savedDraft.id) return true;
      if (state.proposalBinding.sessionGeneration !== sessionGeneration) return true;
      if (state.proposalBinding.editorGeneration !== editorGeneration) return true;
      return (
        bound.boundRevision !== state.savedDraft.revision ||
        bound.boundClientEditVersion !== state.editVersion ||
        bound.boundBriefVersion !== state.briefVersion
      );
    },
    clearProposalBinding() {
      setState({ proposalBinding: null });
    },
    async recheckOutcome() {
      const pending = state.pendingOutcome;
      if (!pending) return fail("NOT_FOUND", "No unresolved outcome.");
      if (
        pending.sessionGeneration !== sessionGeneration ||
        pending.editorGeneration !== editorGeneration ||
        state.savedDraft?.id !== pending.draftId
      ) {
        setState({ pendingOutcome: null });
        return fail("CONTEXT_MISMATCH", "Pending outcome no longer applies to this context.");
      }
      if (!state.localFields || !state.savedDraft) {
        return fail("NOT_FOUND", "No draft open.");
      }
      const ctx: AsyncOpContext = {
        sessionGeneration,
        editorGeneration,
        draftId: pending.draftId,
        operationId: beginOperation(),
        expectedRevision: state.savedDraft.revision,
        editVersionAtDispatch: state.editVersion,
        localAtDispatch: { ...state.localFields },
        savedAtDispatch: { ...state.savedDraft.fields },
      };
      setState({ saving: true });
      return reconcileCommand(pending.draftId, pending.commandId, ctx);
    },
    async submit(reviewedPolicyVersion: string) {
      if (!state.savedDraft || state.dirty) return null;
      if (state.pendingOutcome) {
        return fail("OUTCOME_UNKNOWN", "Resolve the previous uncertain mutation first.");
      }
      return request(`/api/trips/${state.savedDraft.id}/submit`, {
        method: "POST",
        body: JSON.stringify({
          expectedRevision: state.savedDraft.revision,
          reviewedPolicyVersion,
          commandId: newCommandId(),
        }),
      });
    },
  };
}

export type Coordinator = ReturnType<typeof createCoordinator>;
