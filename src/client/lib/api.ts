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
  const res = await fetch(path, {
    ...init,
    headers,
    credentials: "same-origin",
  });
  const json = (await res.json()) as ApiEnvelope<T>;
  return json;
}

export function newCommandId(): string {
  return crypto.randomUUID();
}
