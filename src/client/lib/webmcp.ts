import type { Coordinator } from "./coordinator";
import { newCommandId } from "./api";
import type { TripPatch } from "../../domain/types";

type ToolRegistration = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: Record<string, unknown>;
  execute: (args: Record<string, unknown>, opts?: { signal?: AbortSignal }) => Promise<string>;
};

type ModelContext = {
  registerTool: (tool: ToolRegistration, opts?: { signal?: AbortSignal }) => Promise<void> | void;
};

declare global {
  interface Document {
    modelContext?: ModelContext;
  }
}

export function isNativeWebMcpAvailable(): boolean {
  return typeof document !== "undefined" && Boolean(document.modelContext);
}

/**
 * Registers the three draft tools while the editable draft editor is mounted.
 * Cleanup uses AbortSignal (Chrome imperative API). Do not assume .unregister().
 */
export function registerTripDraftTools(options: {
  draftId: string;
  canMutate: boolean;
  coordinator: Coordinator;
  signal: AbortSignal;
}): { available: boolean; reason?: string } {
  const ctx = document.modelContext;
  if (!ctx) {
    return { available: false, reason: "document.modelContext is unavailable in this browser" };
  }

  const envelope = (value: unknown) => JSON.stringify(value);

  const readTool: ToolRegistration = {
    name: "get_trip_draft",
    description:
      "Read the authorized saved trip draft, revision, status, and whether the editor has unsaved local edits. Does not return the unsaved buffer.",
    inputSchema: {
      type: "object",
      properties: { draftId: { type: "string" } },
      required: ["draftId"],
    },
    annotations: { readOnlyHint: true },
    execute: async (args) => {
      if (args.draftId !== options.draftId) {
        return envelope({
          ok: false,
          error: { code: "CONTEXT_MISMATCH", message: "Open the requested draft first." },
        });
      }
      const state = options.coordinator.getState();
      if (!state.savedDraft) {
        return envelope({
          ok: false,
          error: { code: "NOT_FOUND", message: "No draft open." },
        });
      }
      return envelope({
        ok: true,
        data: {
          id: state.savedDraft.id,
          revision: state.savedDraft.revision,
          status: state.savedDraft.status,
          fields: state.savedDraft.fields,
          hasUnsavedChanges: state.dirty,
        },
      });
    },
  };

  const validateTool: ToolRegistration = {
    name: "validate_trip_draft",
    description:
      "Validate the saved draft and return field issues and deterministic policy findings. Does not submit.",
    inputSchema: {
      type: "object",
      properties: {
        draftId: { type: "string" },
        expectedRevision: { type: "number" },
      },
      required: ["draftId", "expectedRevision"],
    },
    annotations: { readOnlyHint: true },
    execute: async (args) => {
      if (args.draftId !== options.draftId) {
        return envelope({
          ok: false,
          error: { code: "CONTEXT_MISMATCH", message: "Open the requested draft first." },
        });
      }
      const res = await options.coordinator.validateSaved();
      if (!res) {
        return envelope({
          ok: false,
          error: { code: "NOT_FOUND", message: "No draft open." },
        });
      }
      return envelope(res);
    },
  };

  const tools = [readTool, validateTool];
  if (options.canMutate) {
    tools.push({
      name: "update_trip_draft",
      description:
        "Apply an allowlisted patch to the saved draft with expectedRevision and commandId. Refuses when the form has unsaved edits. Cannot submit.",
      inputSchema: {
        type: "object",
        properties: {
          draftId: { type: "string" },
          expectedRevision: { type: "number" },
          commandId: { type: "string" },
          patch: { type: "object" },
        },
        required: ["draftId", "expectedRevision", "commandId", "patch"],
      },
      execute: async (args) => {
        if (args.draftId !== options.draftId) {
          return envelope({
            ok: false,
            error: { code: "CONTEXT_MISMATCH", message: "Open the requested draft first." },
          });
        }
        const commandId = String(args.commandId || newCommandId());
        const res = await options.coordinator.applyAgentPatch(
          args.patch as TripPatch,
          Number(args.expectedRevision),
          commandId,
        );
        return envelope(res);
      },
    });
  }

  for (const tool of tools) {
    void Promise.resolve(ctx.registerTool(tool, { signal: options.signal })).catch((error) => {
      console.warn("WebMCP registerTool failed", error);
    });
  }

  return { available: true };
}
