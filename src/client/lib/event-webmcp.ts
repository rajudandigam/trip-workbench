import type { EventCoordinator } from "./event-coordinator";
import {
  createGetEventDraftArgsSchema,
  createPrepareEventReviewArgsSchema,
  createUpdateEventDraftArgsSchema,
  createValidateEventDraftArgsSchema,
  getEventDraftJsonSchema,
  prepareEventReviewJsonSchema,
  updateEventDraftJsonSchema,
  validateEventDraftJsonSchema,
} from "../../domain/event-schemas.js";
import type { ToolRegistrationState } from "./webmcp.js";

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

function envelope(value: unknown): string {
  return JSON.stringify(value);
}

function toolError(code: string, message: string, extra: Record<string, unknown> = {}) {
  return envelope({ ok: false, error: { code, message, ...extra } });
}

/**
 * Page-scoped event tools for the open event editor.
 * Entry to the event area remains a normal authenticated app navigation control.
 */
export function registerEventDraftTools(options: {
  eventId: string;
  canMutate: boolean;
  coordinator: EventCoordinator;
  signal: AbortSignal;
  onStatus?: (status: ToolRegistrationState) => void;
}): { available: boolean; reason?: string } {
  const ctx = (document as Document & { modelContext?: ModelContext }).modelContext;
  const report = (status: ToolRegistrationState) => options.onStatus?.(status);
  if (!ctx) {
    report({
      phase: "unsupported",
      detail: "document.modelContext is unavailable in this browser",
    });
    return { available: false, reason: "document.modelContext is unavailable in this browser" };
  }

  report({ phase: "registering", detail: "Registering event tools…" });
  const eventId = options.eventId;
  let registrationError: string | undefined;
  let settled = 0;
  const expected = options.canMutate ? 4 : 3;

  const markSettled = () => {
    settled += 1;
    if (settled < expected) return;
    if (registrationError) {
      report({ phase: "failed", detail: registrationError, error: registrationError });
    } else if (!options.signal.aborted) {
      report({
        phase: "ready",
        detail: options.canMutate
          ? "Event tools ready (get/update/validate/prepare)"
          : "Event read tools ready (get/validate/prepare)",
      });
    }
  };

  const tools: ToolRegistration[] = [
    {
      name: "get_event_draft",
      description: `Read saved event draft ${eventId}. Preserves local unsaved edits. Does not submit.`,
      inputSchema: getEventDraftJsonSchema(eventId),
      annotations: { readOnlyHint: true },
      execute: async (args, opts) => {
        if (opts?.signal?.aborted || options.signal.aborted) {
          return toolError("CANCELLED", "Cancelled.");
        }
        const parsed = createGetEventDraftArgsSchema(eventId).safeParse(args);
        if (!parsed.success) return toolError("INVALID_INPUT", "Invalid get_event_draft arguments.");
        return envelope(await options.coordinator.refreshSavedDraft(eventId));
      },
    },
    {
      name: "validate_event_draft",
      description: `Validate event ${eventId} at expectedRevision. Does not substitute a newer revision.`,
      inputSchema: validateEventDraftJsonSchema(eventId),
      annotations: { readOnlyHint: true },
      execute: async (args, opts) => {
        if (opts?.signal?.aborted || options.signal.aborted) {
          return toolError("CANCELLED", "Cancelled.");
        }
        const parsed = createValidateEventDraftArgsSchema(eventId).safeParse(args);
        if (!parsed.success) {
          return toolError("INVALID_INPUT", "Invalid validate_event_draft arguments.");
        }
        return envelope(
          await options.coordinator.validateAtRevision(
            parsed.data.eventId,
            parsed.data.expectedRevision,
          ),
        );
      },
    },
    {
      name: "prepare_event_review",
      description: `Validate event ${eventId} and show an inline review summary without leaving the editor or submitting.`,
      inputSchema: prepareEventReviewJsonSchema(eventId),
      annotations: { readOnlyHint: true },
      execute: async (args, opts) => {
        if (opts?.signal?.aborted || options.signal.aborted) {
          return toolError("CANCELLED", "Cancelled.");
        }
        const parsed = createPrepareEventReviewArgsSchema(eventId).safeParse(args);
        if (!parsed.success) {
          return toolError("INVALID_INPUT", "Invalid prepare_event_review arguments.");
        }
        return envelope(
          await options.coordinator.prepareReview(
            parsed.data.eventId,
            parsed.data.expectedRevision,
          ),
        );
      },
    },
  ];

  if (options.canMutate) {
    tools.push({
      name: "update_event_draft",
      description: `Patch allowlisted fields on event ${eventId}. Requires expectedRevision and commandId. Refuses dirty form. Cannot submit.`,
      inputSchema: updateEventDraftJsonSchema(eventId),
      execute: async (args, opts) => {
        if (opts?.signal?.aborted || options.signal.aborted) {
          return toolError("CANCELLED", "Cancelled.");
        }
        const parsed = createUpdateEventDraftArgsSchema(eventId).safeParse(args);
        if (!parsed.success) {
          return toolError("INVALID_INPUT", "Invalid update_event_draft arguments.");
        }
        return envelope(
          await options.coordinator.applyAgentPatch(
            parsed.data.patch,
            parsed.data.expectedRevision,
            parsed.data.commandId,
          ),
        );
      },
    });
  }

  for (const tool of tools) {
    try {
      const result = ctx.registerTool(tool, { signal: options.signal });
      void Promise.resolve(result)
        .then(() => markSettled())
        .catch((error: unknown) => {
          registrationError = (error as Error).message || "registerTool rejected";
          markSettled();
        });
    } catch (error) {
      registrationError = (error as Error).message || "registerTool threw";
      markSettled();
    }
  }

  return { available: true };
}
