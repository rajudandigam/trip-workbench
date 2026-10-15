import type { Coordinator } from "./coordinator";
import {
  createGetTripDraftArgsSchema,
  createUpdateTripDraftArgsSchema,
  createValidateTripDraftArgsSchema,
  getTripDraftJsonSchema,
  updateTripDraftJsonSchema,
  validateTripDraftJsonSchema,
} from "../../domain/trip-schemas.js";

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

export type RegistrationStatus =
  | { available: true; pending: boolean; error?: string }
  | { available: false; reason: string; error?: string };

export function isNativeWebMcpAvailable(): boolean {
  return typeof document !== "undefined" && Boolean(document.modelContext);
}

function envelope(value: unknown): string {
  return JSON.stringify(value);
}

function toolError(code: string, message: string, extra: Record<string, unknown> = {}) {
  return envelope({ ok: false, error: { code, message, ...extra } });
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
}): RegistrationStatus {
  const ctx = document.modelContext;
  if (!ctx) {
    return { available: false, reason: "document.modelContext is unavailable in this browser" };
  }

  const draftId = options.draftId;
  let registrationError: string | undefined;
  let pending = true;

  const readTool: ToolRegistration = {
    name: "get_trip_draft",
    description:
      `Read the authorized saved trip draft for draftId=${draftId} (the currently open editor). ` +
      "Returns saved fields, revision, status, and hasUnsavedChanges. Does not return the unsaved buffer. " +
      "Always refreshes from the server so cross-tab revisions are visible. Revisions come from a fresh read.",
    inputSchema: getTripDraftJsonSchema(draftId),
    annotations: { readOnlyHint: true },
    execute: async (args, opts) => {
      try {
        if (opts?.signal?.aborted) {
          return toolError("CANCELLED", "Tool execution cancelled before start.");
        }
        const parsed = createGetTripDraftArgsSchema(draftId).safeParse(args);
        if (!parsed.success) {
          return toolError("INVALID_INPUT", "Invalid get_trip_draft arguments.");
        }
        const refreshed = await options.coordinator.refreshSavedDraft(draftId);
        if (!refreshed.ok) {
          return envelope(refreshed);
        }
        return envelope({ ok: true, data: refreshed.data });
      } catch (error) {
        return toolError("INTERNAL", (error as Error).message || "get_trip_draft failed");
      }
    },
  };

  const validateTool: ToolRegistration = {
    name: "validate_trip_draft",
    description:
      `Validate the saved draft ${draftId} at the caller's expectedRevision. ` +
      "Returns field issues and deterministic policy findings. Does not submit. " +
      "A stale expectedRevision yields REVISION_CONFLICT; the tool does not substitute a newer revision.",
    inputSchema: validateTripDraftJsonSchema(draftId),
    annotations: { readOnlyHint: true },
    execute: async (args, opts) => {
      try {
        if (opts?.signal?.aborted) {
          return toolError("CANCELLED", "Tool execution cancelled before start.");
        }
        const parsed = createValidateTripDraftArgsSchema(draftId).safeParse(args);
        if (!parsed.success) {
          return toolError("INVALID_INPUT", "Invalid validate_trip_draft arguments.");
        }
        const res = await options.coordinator.validateAtRevision(
          parsed.data.draftId,
          parsed.data.expectedRevision,
        );
        if (!res) {
          return toolError("NOT_FOUND", "No draft open.");
        }
        return envelope(res);
      } catch (error) {
        return toolError("INTERNAL", (error as Error).message || "validate_trip_draft failed");
      }
    },
  };

  const tools: ToolRegistration[] = [readTool, validateTool];
  if (options.canMutate) {
    tools.push({
      name: "update_trip_draft",
      description:
        `Apply an allowlisted patch to draft ${draftId}. ` +
        "Requires expectedRevision from a fresh read and a unique commandId for a new logical mutation " +
        "(reuse the same commandId only for an exact retry). Dates are calendar YYYY-MM-DD values. " +
        "Refuses when the form has unsaved edits. Cannot submit.",
      inputSchema: updateTripDraftJsonSchema(draftId),
      execute: async (args, opts) => {
        try {
          if (opts?.signal?.aborted) {
            return toolError("CANCELLED", "Update cancelled before dispatch.");
          }
          const parsed = createUpdateTripDraftArgsSchema(draftId).safeParse(args);
          if (!parsed.success) {
            return toolError("INVALID_INPUT", "Invalid update_trip_draft arguments.", {
              fieldIssues: parsed.error.issues.map((i) => ({
                field: i.path.join(".") || "general",
                message: i.message,
              })),
            });
          }
          // Do not coerce or invent commandId.
          const res = await options.coordinator.applyAgentPatch(
            parsed.data.patch,
            parsed.data.expectedRevision,
            parsed.data.commandId,
            { signal: opts?.signal },
          );
          return envelope(res);
        } catch (error) {
          return toolError("INTERNAL", (error as Error).message || "update_trip_draft failed");
        }
      },
    });
  }

  for (const tool of tools) {
    try {
      const result = ctx.registerTool(tool, { signal: options.signal });
      void Promise.resolve(result)
        .then(() => {
          pending = false;
        })
        .catch((error: unknown) => {
          pending = false;
          registrationError = (error as Error).message || "registerTool rejected";
          console.warn("WebMCP registerTool failed", error);
        });
    } catch (error) {
      pending = false;
      registrationError = (error as Error).message || "registerTool threw";
      console.warn("WebMCP registerTool threw", error);
    }
  }

  return {
    available: true,
    pending,
    ...(registrationError ? { error: registrationError } : {}),
  };
}
