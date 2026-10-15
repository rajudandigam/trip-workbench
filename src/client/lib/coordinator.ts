import type { TripFields, TripPatch, TripView, ValidationResult } from "../../domain/types";
import { api, newCommandId, setCsrfToken } from "./api";

export type SessionInfo = {
  email: string;
  displayName: string;
  role: "traveler" | "observer";
  tenantId: string;
  csrfToken: string;
  capabilities: { canMutateTrips: boolean; aiMode: string };
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
};

function fieldsEqual(a: TripFields, b: TripFields): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function diffPatch(saved: TripFields, local: TripFields): TripPatch {
  const patch: TripPatch = {};
  (Object.keys(saved) as (keyof TripFields)[]).forEach((key) => {
    if (saved[key] !== local[key]) {
      (patch as Record<string, unknown>)[key] = local[key];
    }
  });
  return patch;
}

export function createCoordinator() {
  let generation = 0;
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
  };
  const listeners = new Set<() => void>();

  function emit() {
    for (const l of listeners) l();
  }

  function setState(partial: Partial<EditorState>) {
    state = { ...state, ...partial, generation };
    emit();
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
    bumpGeneration() {
      generation += 1;
      setState({ generation, savedDraft: null, localFields: null, dirty: false, message: null });
    },
    async loadSession() {
      const res = await api<SessionInfo>("/api/session");
      if (res.ok) setCsrfToken(res.data.csrfToken);
      return res;
    },
    async login(email: string, password: string) {
      const res = await api<SessionInfo>("/api/session", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) setCsrfToken(res.data.csrfToken);
      return res;
    },
    async logout() {
      this.bumpGeneration();
      setCsrfToken(null);
      return api("/api/session", { method: "DELETE" });
    },
    async listTrips() {
      return api<TripView[]>("/api/trips");
    },
    async createTrip() {
      return api<{ tripId: string; toRevision: number }>("/api/trips", {
        method: "POST",
        body: JSON.stringify({ commandId: newCommandId() }),
      });
    },
    async openDraft(id: string) {
      const res = await api<TripView>(`/api/trips/${id}`);
      if (res.ok) {
        setState({
          savedDraft: res.data,
          localFields: { ...res.data.fields },
          dirty: false,
          editVersion: 0,
          brief: "",
          briefVersion: 0,
          message: null,
        });
      }
      return res;
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
    async saveManualPatch() {
      if (!state.savedDraft || !state.localFields || !state.dirty) return null;
      const baseline = state.savedDraft;
      const localAtDispatch = { ...state.localFields };
      const editAtDispatch = state.editVersion;
      const patch = diffPatch(baseline.fields, localAtDispatch);
      const commandId = newCommandId();
      setState({ saving: true, message: null });
      const res = await api<{
        outcome: string;
        toRevision: number;
        fields: TripFields;
        tripId: string;
      }>(`/api/trips/${baseline.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          expectedRevision: baseline.revision,
          commandId,
          patch,
        }),
      });
      if (!res.ok) {
        setState({ saving: false, message: res.error.message });
        return res;
      }
      const editedDuring = state.editVersion !== editAtDispatch;
      const savedDraft: TripView = {
        ...baseline,
        revision: res.data.toRevision ?? baseline.revision,
        fields: res.data.fields,
      };
      if (editedDuring) {
        setState({
          saving: false,
          savedDraft,
          dirty: true,
          message: "Saved state changed while you were editing. Your newer local edits were kept.",
        });
      } else {
        setState({
          saving: false,
          savedDraft,
          localFields: { ...res.data.fields },
          dirty: false,
          message: null,
        });
      }
      return res;
    },
    async applyAgentPatch(patch: TripPatch, expectedRevision: number, commandId: string) {
      if (!state.savedDraft) {
        return {
          ok: false as const,
          error: { code: "NOT_FOUND", message: "No draft open" },
        };
      }
      if (state.dirty) {
        return {
          ok: false as const,
          error: {
            code: "USER_EDIT_IN_PROGRESS",
            message: "Save or discard local edits before an agent update.",
          },
        };
      }
      if (state.saving) {
        return {
          ok: false as const,
          error: { code: "COMMAND_IN_PROGRESS", message: "A save is already in progress." },
        };
      }
      setState({ saving: true });
      const res = await api<{
        outcome: string;
        toRevision: number;
        fields: TripFields;
      }>(`/api/trips/${state.savedDraft.id}`, {
        method: "PATCH",
        body: JSON.stringify({ expectedRevision, commandId, patch }),
      });
      if (res.ok) {
        const savedDraft: TripView = {
          ...state.savedDraft,
          revision: res.data.toRevision,
          fields: res.data.fields,
        };
        setState({
          saving: false,
          savedDraft,
          localFields: { ...res.data.fields },
          dirty: false,
        });
      } else {
        setState({ saving: false, message: res.error.message });
      }
      return res;
    },
    async validateSaved() {
      if (!state.savedDraft) return null;
      return api<ValidationResult>(`/api/trips/${state.savedDraft.id}/validate`, {
        method: "POST",
        body: JSON.stringify({ expectedRevision: state.savedDraft.revision }),
      });
    },
    async requestProposal() {
      if (!state.savedDraft) return null;
      return api<{
        proposal: { patch: TripPatch; clarifications: Array<{ field: string | null; kind: string; question: string }> };
        boundRevision: number;
        boundClientEditVersion: number;
        boundBriefVersion: number;
        mode: string;
      }>(`/api/trips/${state.savedDraft.id}/proposal`, {
        method: "POST",
        body: JSON.stringify({
          brief: state.brief,
          expectedRevision: state.savedDraft.revision,
          clientEditVersion: state.editVersion,
          briefVersion: state.briefVersion,
        }),
      });
    },
    isProposalStale(bound: {
      boundRevision: number;
      boundClientEditVersion: number;
      boundBriefVersion: number;
    }) {
      if (!state.savedDraft) return true;
      return (
        bound.boundRevision !== state.savedDraft.revision ||
        bound.boundClientEditVersion !== state.editVersion ||
        bound.boundBriefVersion !== state.briefVersion
      );
    },
    async submit(reviewedPolicyVersion: string) {
      if (!state.savedDraft || state.dirty) return null;
      return api(`/api/trips/${state.savedDraft.id}/submit`, {
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
