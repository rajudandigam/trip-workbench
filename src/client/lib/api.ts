export type ApiEnvelope<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; [key: string]: unknown } };

let csrfToken: string | null = null;

export function setCsrfToken(token: string | null) {
  csrfToken = token;
}

export function getCsrfToken() {
  return csrfToken;
}

export async function api<T>(
  path: string,
  init: RequestInit = {},
): Promise<ApiEnvelope<T>> {
  const headers = new Headers(init.headers || {});
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }
  if (csrfToken && init.method && init.method !== "GET") {
    headers.set("x-csrf-token", csrfToken);
  }
  try {
    const res = await fetch(path, {
      ...init,
      headers,
      credentials: "same-origin",
    });
    let json: ApiEnvelope<T>;
    try {
      json = (await res.json()) as ApiEnvelope<T>;
    } catch {
      return {
        ok: false,
        error: {
          code: res.status === 401 ? "UNAUTHENTICATED" : "INVALID_RESPONSE",
          message: "Server returned a non-JSON response.",
          httpStatus: res.status,
        },
      };
    }
    if (!json || typeof json !== "object" || !("ok" in json)) {
      return {
        ok: false,
        error: {
          code: "INVALID_RESPONSE",
          message: "Server returned an unexpected envelope.",
          httpStatus: res.status,
        },
      };
    }
    return json;
  } catch (error) {
    const aborted =
      (error instanceof DOMException && error.name === "AbortError") ||
      (error instanceof Error && error.name === "AbortError");
    return {
      ok: false,
      error: {
        code: aborted ? "ABORTED" : "NETWORK_ERROR",
        message: aborted ? "Request aborted." : (error as Error).message || "Network request failed.",
      },
    };
  }
}

export function newCommandId(): string {
  return crypto.randomUUID();
}
