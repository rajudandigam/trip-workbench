import type {
  EventCommandReceipt,
  EventFields,
  EventPatch,
  EventValidationResult,
  EventView,
} from "../../domain/event-types.js";
import { eventFieldsEqual } from "../../domain/event-rules.js";
import { api, newCommandId } from "./api.js";

type Fail = { ok: false; error: { code: string; message: string; [key: string]: unknown } };

export type EventEditorState = {
  savedDraft: EventView | null;
  localFields: EventFields | null;
  dirty: boolean;
  saving: boolean;
  message: string | null;
  preparedReview: (EventValidationResult & { preparedAtRevision: number; submitted: false }) | null;
};

function diffPatch(saved: EventFields, local: EventFields): EventPatch {
  const patch: EventPatch = {};
  (Object.keys(saved) as Array<keyof EventFields>).forEach((key) => {
    if (saved[key] !== local[key]) {
      patch[key] = local[key] as never;
    }
  });
  return patch;
}

function fail(code: string, message: string, extra: Record<string, unknown> = {}): Fail {
  return { ok: false, error: { code, message, ...extra } };
}

export function createEventCoordinator(deps: { fetchImpl?: typeof api } = {}) {
  const request = deps.fetchImpl || api;
  let state: EventEditorState = {
    savedDraft: null,
    localFields: null,
    dirty: false,
    saving: false,
    message: null,
    preparedReview: null,
  };
  const listeners = new Set<() => void>();

  function emit() {
    for (const l of listeners) l();
  }

  function setState(partial: Partial<EventEditorState>) {
    state = { ...state, ...partial };
    emit();
  }

  return {
    subscribe(fn: () => void) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    getState() {
      return state;
    },
    leaveEditor() {
      setState({
        savedDraft: null,
        localFields: null,
        dirty: false,
        saving: false,
        message: null,
        preparedReview: null,
      });
    },
    async listEvents() {
      return request<EventView[]>("/api/events");
    },
    async createEvent() {
      return request<EventCommandReceipt>("/api/events", {
        method: "POST",
        body: JSON.stringify({ commandId: newCommandId() }),
      });
    },
    async openDraft(id: string) {
      const res = await request<EventView>(`/api/events/${id}`);
      if (!res.ok) return res;
      setState({
        savedDraft: res.data,
        localFields: { ...res.data.fields },
        dirty: false,
        message: null,
        preparedReview: null,
      });
      return res;
    },
    async refreshSavedDraft(eventId: string) {
      if (!state.savedDraft || state.savedDraft.id !== eventId || !state.localFields) {
        return fail("CONTEXT_MISMATCH", "Open the requested event draft first.");
      }
      const localAtDispatch = { ...state.localFields };
      const savedAtDispatch = { ...state.savedDraft.fields };
      const res = await request<EventView>(`/api/events/${eventId}`);
      if (!res.ok) return res;
      if (!state.savedDraft || state.savedDraft.id !== eventId || !state.localFields) {
        return fail("CONTEXT_MISMATCH", "Event draft is no longer open.");
      }
      if (res.data.revision < state.savedDraft.revision) {
        return {
          ok: true as const,
          data: {
            id: state.savedDraft.id,
            revision: state.savedDraft.revision,
            status: state.savedDraft.status,
            fields: state.savedDraft.fields,
            hasUnsavedChanges: state.dirty,
          },
        };
      }
      const nextLocal: EventFields = { ...res.data.fields };
      (Object.keys(res.data.fields) as Array<keyof EventFields>).forEach((key) => {
        const dirtyAtDispatch = localAtDispatch[key] !== savedAtDispatch[key];
        const editedDuring = state.localFields![key] !== localAtDispatch[key];
        if (dirtyAtDispatch || editedDuring) {
          nextLocal[key] = state.localFields![key] as never;
        }
      });
      const nextDirty = !eventFieldsEqual(nextLocal, res.data.fields);
      setState({
        savedDraft: res.data,
        localFields: nextLocal,
        dirty: nextDirty,
        preparedReview:
          state.preparedReview && state.preparedReview.preparedAtRevision === res.data.revision
            ? state.preparedReview
            : null,
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
    updateLocalField<K extends keyof EventFields>(key: K, value: EventFields[K]) {
      if (!state.localFields || !state.savedDraft) return;
      const localFields = { ...state.localFields, [key]: value };
      setState({
        localFields,
        dirty: !eventFieldsEqual(localFields, state.savedDraft.fields),
        preparedReview: null,
      });
    },
    discardLocal() {
      if (!state.savedDraft) return;
      setState({
        localFields: { ...state.savedDraft.fields },
        dirty: false,
        message: null,
        preparedReview: null,
      });
    },
    async saveManualPatch() {
      if (!state.savedDraft || !state.localFields || !state.dirty) return null;
      if (state.saving) return fail("COMMAND_IN_PROGRESS", "A save is already in progress.");
      const patch = diffPatch(state.savedDraft.fields, state.localFields);
      setState({ saving: true, message: null });
      const res = await request<EventCommandReceipt>(`/api/events/${state.savedDraft.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          expectedRevision: state.savedDraft.revision,
          commandId: newCommandId(),
          patch,
        }),
      });
      if (!res.ok) {
        setState({ saving: false, message: res.error.message });
        return res;
      }
      setState({
        saving: false,
        savedDraft: {
          ...state.savedDraft,
          revision: res.data.toRevision ?? state.savedDraft.revision,
          fields: res.data.fields ?? state.savedDraft.fields,
          status: res.data.status ?? state.savedDraft.status,
        },
        localFields: { ...(res.data.fields ?? state.savedDraft.fields) },
        dirty: false,
        preparedReview: null,
        message: null,
      });
      return res;
    },
    async applyAgentPatch(patch: EventPatch, expectedRevision: number, commandId: string) {
      if (!state.savedDraft || !state.localFields) {
        return fail("NOT_FOUND", "No event draft open.");
      }
      if (state.dirty) {
        return fail(
          "USER_EDIT_IN_PROGRESS",
          "Save or discard local edits before an agent update.",
        );
      }
      if (state.saving) {
        return fail("COMMAND_IN_PROGRESS", "A save is already in progress.");
      }
      setState({ saving: true, message: null });
      const res = await request<EventCommandReceipt>(`/api/events/${state.savedDraft.id}`, {
        method: "PATCH",
        body: JSON.stringify({ expectedRevision, commandId, patch }),
      });
      if (!res.ok) {
        setState({ saving: false, message: res.error.message });
        return res;
      }
      setState({
        saving: false,
        savedDraft: {
          ...state.savedDraft,
          revision: res.data.toRevision ?? state.savedDraft.revision,
          fields: res.data.fields ?? state.savedDraft.fields,
          status: res.data.status ?? state.savedDraft.status,
        },
        localFields: { ...(res.data.fields ?? state.savedDraft.fields) },
        dirty: false,
        preparedReview: null,
        message: null,
      });
      return res;
    },
    async validateAtRevision(eventId: string, expectedRevision: number) {
      if (!state.savedDraft || state.savedDraft.id !== eventId) {
        return fail("CONTEXT_MISMATCH", "Open the requested event draft first.");
      }
      return request<EventValidationResult>(`/api/events/${eventId}/validate`, {
        method: "POST",
        body: JSON.stringify({ expectedRevision }),
      });
    },
    async prepareReview(eventId: string, expectedRevision: number) {
      if (!state.savedDraft || state.savedDraft.id !== eventId || !state.localFields) {
        return fail("CONTEXT_MISMATCH", "Open the requested event draft first.");
      }
      if (state.dirty) {
        return fail(
          "USER_EDIT_IN_PROGRESS",
          "Save or discard local edits before preparing a review.",
        );
      }
      if (state.savedDraft.revision !== expectedRevision) {
        return fail("REVISION_CONFLICT", "This draft changed.", {
          currentRevision: state.savedDraft.revision,
          retry: "refresh_and_review",
        });
      }
      const res = await request<EventValidationResult>(`/api/events/${eventId}/validate`, {
        method: "POST",
        body: JSON.stringify({ expectedRevision }),
      });
      if (!res.ok) return res;
      const prepared = {
        ...res.data,
        preparedAtRevision: expectedRevision,
        submitted: false as const,
      };
      setState({ preparedReview: prepared, message: null });
      return {
        ok: true as const,
        data: {
          eventId,
          revision: prepared.revision,
          policyVersion: prepared.policyVersion,
          valid: prepared.valid,
          canSubmit: prepared.canSubmit,
          fieldIssues: prepared.fieldIssues,
          reviewRequirements: prepared.reviewRequirements,
          submitted: false as const,
          status: "draft" as const,
        },
      };
    },
    clearPreparedReview() {
      setState({ preparedReview: null });
    },
    async submit(reviewedRevision: number, reviewedPolicyVersion: string) {
      if (!state.savedDraft || state.dirty) {
        return fail("USER_EDIT_IN_PROGRESS", "Save or discard edits before submitting.");
      }
      if (state.savedDraft.revision !== reviewedRevision) {
        return fail(
          "REVIEW_STALE",
          "Saved state changed since this review. Refresh and review again.",
          {
            reviewedRevision,
            currentRevision: state.savedDraft.revision,
          },
        );
      }
      setState({ saving: true, message: null });
      const res = await request<EventCommandReceipt>(`/api/events/${state.savedDraft.id}/submit`, {
        method: "POST",
        body: JSON.stringify({
          expectedRevision: reviewedRevision,
          reviewedPolicyVersion,
          commandId: newCommandId(),
        }),
      });
      if (!res.ok) {
        setState({ saving: false, message: res.error.message });
        return res;
      }
      setState({
        saving: false,
        preparedReview: null,
        savedDraft: {
          ...state.savedDraft,
          status: "submitted",
          revision: res.data.toRevision ?? state.savedDraft.revision,
          fields: res.data.fields ?? state.savedDraft.fields,
        },
        localFields: { ...(res.data.fields ?? state.savedDraft.fields) },
        dirty: false,
        message: null,
      });
      return res;
    },
  };
}

export type EventCoordinator = ReturnType<typeof createEventCoordinator>;
