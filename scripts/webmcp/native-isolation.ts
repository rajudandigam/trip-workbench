/**
 * Helpers for isolating native WebMCP scenarios.
 * Separates native call status from app envelope and effect assertions.
 */

export type NativeCallStatus =
  | "success"
  | "error"
  | "timeout"
  | "aborted"
  | "unknown";

export type AppEnvelope = {
  ok?: boolean;
  data?: unknown;
  error?: { code?: string; message?: string };
};

export type NativeInvokeObservation = {
  tool: string;
  /** Raw status string from page.webmcp tool.execute when present. */
  nativeStatus: NativeCallStatus;
  nativeStatusRaw: string | null;
  envelope: AppEnvelope | null;
  envelopeOk: boolean | null;
  errorCode: string | null;
};

export function classifyNativeStatus(raw: unknown): {
  status: NativeCallStatus;
  raw: string | null;
} {
  if (typeof raw !== "string" || raw.trim() === "") {
    return { status: "unknown", raw: raw == null ? null : String(raw) };
  }
  const normalized = raw.trim().toLowerCase();
  if (normalized === "success" || normalized === "ok" || normalized === "completed") {
    return { status: "success", raw };
  }
  if (normalized === "error" || normalized === "failed" || normalized === "failure") {
    return { status: "error", raw };
  }
  if (normalized === "timeout" || normalized === "timed_out") {
    return { status: "timeout", raw };
  }
  if (normalized === "aborted" || normalized === "cancelled" || normalized === "canceled") {
    return { status: "aborted", raw };
  }
  return { status: "unknown", raw };
}

export function observeNativeInvoke(
  tool: string,
  call: { status?: unknown; output?: unknown },
  envelope: AppEnvelope | null,
): NativeInvokeObservation {
  const classified = classifyNativeStatus(call.status);
  return {
    tool,
    nativeStatus: classified.status,
    nativeStatusRaw: classified.raw,
    envelope,
    envelopeOk: typeof envelope?.ok === "boolean" ? envelope.ok : null,
    errorCode: envelope?.error?.code ?? null,
  };
}

/**
 * True when an app-level dirty refusal is established without relying on native
 * transport success alone.
 */
export function isDirtyRefusal(
  observation: NativeInvokeObservation,
  expectedCode = "USER_EDIT_IN_PROGRESS",
): boolean {
  return (
    observation.envelopeOk === false &&
    observation.errorCode === expectedCode
  );
}

/** Match the draft GET that get_trip_draft / refreshSavedDraft issues. */
export function isTripDraftGet(url: string, draftId: string, method: string): boolean {
  if (method !== "GET") return false;
  try {
    const parsed = new URL(url, "http://localhost");
    const path = parsed.pathname.replace(/\/$/, "");
    return path === `/api/trips/${draftId}`;
  } catch {
    return false;
  }
}

export function isTripPatch(url: string, draftId: string, method: string): boolean {
  if (method !== "PATCH") return false;
  try {
    const parsed = new URL(url, "http://localhost");
    const path = parsed.pathname.replace(/\/$/, "");
    return path === `/api/trips/${draftId}`;
  } catch {
    return false;
  }
}
