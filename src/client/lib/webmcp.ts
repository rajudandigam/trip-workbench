import type { Coordinator } from "./coordinator";
import {
  createGetTripDraftArgsSchema,
  createPrepareTripReviewArgsSchema,
  createRecheckTripUpdateArgsSchema,
  createUpdateTripDraftArgsSchema,
  createValidateTripDraftArgsSchema,
  getTripDraftJsonSchema,
  prepareTripReviewJsonSchema,
  recheckTripUpdateJsonSchema,
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

export type ToolRegistrationState = {
  phase: "unsupported" | "supported" | "registering" | "ready" | "failed";
  detail?: string;
  error?: string;
};

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
 * Registers draft tools while the editable draft editor is mounted.
 * Cleanup uses AbortSignal (Chrome imperative API). Do not assume .unregister().
 */
export function registerTripDraftTools(options: {
  draftId: string;
  canMutate: boolean;
  coordinator: Coordinator;
  signal: AbortSignal;
  onStatus?: (status: ToolRegistrationState) => void;
}): RegistrationStatus {
  const ctx = document.modelContext;
  const report = (status: ToolRegistrationState) => {
    options.onStatus?.(status);
  };

  if (!ctx) {
    const status: RegistrationStatus = {
      available: false,
      reason: "document.modelContext is unavailable in this browser",
    };
    report({ phase: "unsupported", detail: status.reason });
    return status;
  }

  report({ phase: "supported", detail: "document.modelContext present" });
  report({ phase: "registering", detail: "Registering tools…" });

  const draftId = options.draftId;
  let registrationError: string | undefined;
  let pending = true;
  let settled = 0;
  const expectedToolCount = options.canMutate ? 5 : 3;

  const markSettled = () => {
    settled += 1;
    if (settled >= expectedToolCount) {
      pending = false;
      if (registrationError) {
        report({ phase: "failed", detail: registrationError, error: registrationError });
      } else if (!options.signal.aborted) {
        report({
          phase: "ready",
          detail: options.canMutate
            ? "Five tools registered (read/update/validate/prepare/recheck)"
            : "Read/validate/prepare tools registered (mutation tools omitted)",
        });
      }
    }
  };

  const readTool: ToolRegistration = {
    name: "get_trip_draft",
    description:
      `Read the authorized saved trip draft for draftId=${draftId} (the currently open editor). ` +
      "Returns saved fields, revision, status, and hasUnsavedChanges. Does not return the unsaved buffer. " +
      "Always refreshes from the server so cross-tab revisions are visible. Preserves local unsaved edits.",
    inputSchema: getTripDraftJsonSchema(draftId),
    annotations: { readOnlyHint: true },
    execute: async (args, opts) => {
      try {
        if (opts?.signal?.aborted || options.signal.aborted) {
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
        if (opts?.signal?.aborted || options.signal.aborted) {
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

  const prepareTool: ToolRegistration = {
    name: "prepare_trip_review",
    description:
      `Validate draft ${draftId} at expectedRevision and show an inline review summary in the editor. ` +
      "Does not navigate away and does not submit. Refuses dirty, busy, unresolved, or stale contexts. " +
      "Returns findings, canSubmit, and submitted=false.",
    inputSchema: prepareTripReviewJsonSchema(draftId),
    annotations: { readOnlyHint: true },
    execute: async (args, opts) => {
      try {
        if (opts?.signal?.aborted || options.signal.aborted) {
          return toolError("CANCELLED", "Tool execution cancelled before start.");
        }
        const parsed = createPrepareTripReviewArgsSchema(draftId).safeParse(args);
        if (!parsed.success) {
          return toolError("INVALID_INPUT", "Invalid prepare_trip_review arguments.");
        }
        const res = await options.coordinator.prepareReview(
          parsed.data.draftId,
          parsed.data.expectedRevision,
        );
        return envelope(res);
      } catch (error) {
        return toolError("INTERNAL", (error as Error).message || "prepare_trip_review failed");
      }
    },
  };

  const tools: ToolRegistration[] = [readTool, validateTool, prepareTool];

  if (options.canMutate) {
    tools.push({
      name: "update_trip_draft",
      description:
        `Apply an allowlisted patch to draft ${draftId}. ` +
        "Requires expectedRevision from a fresh read and a unique commandId for a new logical mutation " +
        "(reuse the same commandId only for an exact retry). Dates are calendar YYYY-MM-DD values. " +
        "Refuses when the form has unsaved edits, is busy, or has an unresolved outcome. Cannot submit.",
      inputSchema: updateTripDraftJsonSchema(draftId),
      execute: async (args, opts) => {
        try {
          if (opts?.signal?.aborted || options.signal.aborted) {
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

    tools.push({
      name: "recheck_trip_update",
      description:
        `Reconcile the editor's existing unresolved update for draft ${draftId} without dispatching another write. ` +
        "Requires the pending commandId. Returns an explicit error when no matching pending update exists. " +
        "Does not accept arbitrary receipt lookups or invent a new commandId.",
      inputSchema: recheckTripUpdateJsonSchema(draftId),
      execute: async (args, opts) => {
        try {
          if (opts?.signal?.aborted || options.signal.aborted) {
            return toolError("CANCELLED", "Recheck cancelled before start.");
          }
          const parsed = createRecheckTripUpdateArgsSchema(draftId).safeParse(args);
          if (!parsed.success) {
            return toolError("INVALID_INPUT", "Invalid recheck_trip_update arguments.");
          }
          const res = await options.coordinator.recheckOutcome({
            draftId: parsed.data.draftId,
            commandId: parsed.data.commandId,
          });
          return envelope(res);
        } catch (error) {
          return toolError("INTERNAL", (error as Error).message || "recheck_trip_update failed");
        }
      },
    });
  }

  for (const tool of tools) {
    try {
      const result = ctx.registerTool(tool, { signal: options.signal });
      void Promise.resolve(result)
        .then(() => {
          markSettled();
        })
        .catch((error: unknown) => {
          registrationError = (error as Error).message || "registerTool rejected";
          console.warn("WebMCP registerTool failed", error);
          markSettled();
        });
    } catch (error) {
      registrationError = (error as Error).message || "registerTool threw";
      console.warn("WebMCP registerTool threw", error);
      markSettled();
    }
  }

  return {
    available: true,
    pending,
    ...(registrationError ? { error: registrationError } : {}),
  };
}
