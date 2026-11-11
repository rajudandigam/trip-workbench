import { createServer, type Server } from "node:http";
import { loadConfig } from "../../src/server/config.js";
import { createPool, type Db } from "../../src/server/db/pool.js";
import { runMigrations } from "../../src/server/db/migrate.js";
import { seedDatabase } from "../../src/server/db/seed.js";
import { createApp } from "../../src/server/app.js";

export type TestApp = {
  baseUrl: string;
  db: Db;
  close: () => Promise<void>;
};

function defaultPort(url: URL): string {
  if (url.port) return url.port;
  return url.protocol === "https:" ? "443" : "5432";
}

/** True when two Postgres URLs point at the same host/port/database. */
export function sameDatabaseTarget(a: string, b: string): boolean {
  const ua = new URL(a);
  const ub = new URL(b);
  const pathA = decodeURIComponent(ua.pathname.replace(/\/$/, "") || "/");
  const pathB = decodeURIComponent(ub.pathname.replace(/\/$/, "") || "/");
  return (
    ua.hostname === ub.hostname &&
    defaultPort(ua) === defaultPort(ub) &&
    pathA === pathB
  );
}

/**
 * Resolve a disposable test database URL. Refuses a missing TEST_DATABASE_URL
 * and refuses aliasing the normal application DATABASE_URL unless the caller
 * explicitly marked a separately provisioned isolated database
 * (TW_ISOLATED_TEST_DB=1).
 *
 * Pass `appDatabaseUrl` when DATABASE_URL may already have been overwritten to
 * the test URL by a prior startTestApp call in the same process.
 */
export function resolveDisposableTestDatabaseUrl(
  env: NodeJS.ProcessEnv = process.env,
  appDatabaseUrl?: string,
): string {
  const testUrl = env.TEST_DATABASE_URL?.trim();
  if (!testUrl) {
    throw new Error(
      "TEST_DATABASE_URL is required before migrate/seed in tests. Refusing to use DATABASE_URL so application data cannot be erased.",
    );
  }
  const appUrl = (appDatabaseUrl ?? env.TW_APP_DATABASE_URL ?? env.DATABASE_URL)?.trim();
  if (
    appUrl &&
    sameDatabaseTarget(appUrl, testUrl) &&
    env.TW_ISOLATED_TEST_DB !== "1"
  ) {
    throw new Error(
      "TEST_DATABASE_URL resolves to the same database as DATABASE_URL. Use a separate disposable database (for example trip_workbench_test), or set TW_ISOLATED_TEST_DB=1 for an explicitly provisioned isolated test database.",
    );
  }
  return testUrl;
}

/** First-seen application DATABASE_URL for this process (before test overlay). */
let capturedAppDatabaseUrl: string | undefined;

export async function startTestApp(): Promise<TestApp> {
  process.env.DEMO_FIXED_NOW = "2026-10-14T19:00:00.000Z";
  process.env.AI_MODE = process.env.AI_MODE || "fixture";
  if (!capturedAppDatabaseUrl && process.env.DATABASE_URL?.trim()) {
    capturedAppDatabaseUrl = process.env.DATABASE_URL.trim();
    process.env.TW_APP_DATABASE_URL = capturedAppDatabaseUrl;
  }
  const testUrl = resolveDisposableTestDatabaseUrl(
    process.env,
    capturedAppDatabaseUrl ?? process.env.TW_APP_DATABASE_URL,
  );
  // Point the process at the disposable DB only after the guard passes.
  process.env.DATABASE_URL = testUrl;
  const config = loadConfig();
  const db = createPool(config.databaseUrl);
  await runMigrations(db);
  await seedDatabase(db, config.seedPassword);
  const app = createApp(config, db);
  const server: Server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test server address");
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    db,
    close: async () => {
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      );
      await db.end();
    },
  };
}

function parseCookies(res: Response): string {
  const anyHeaders = res.headers as Headers & { getSetCookie?: () => string[] };
  const list = anyHeaders.getSetCookie?.() || [];
  if (list.length) {
    return list.map((c) => c.split(";")[0]).join("; ");
  }
  const single = res.headers.get("set-cookie");
  return single ? single.split(";")[0] : "";
}

type JsonBody = {
  ok?: boolean;
  data?: Record<string, unknown>;
  error?: { code?: string; message?: string };
  [key: string]: unknown;
};

export async function login(baseUrl: string, email: string, password = "Password123!") {
  const res = await fetch(`${baseUrl}/api/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = (await res.json()) as JsonBody;
  const cookie = parseCookies(res);
  const csrfToken = String(body.data?.csrfToken || "");
  return { cookie, csrfToken, body, status: res.status };
}

export async function authedJson(
  baseUrl: string,
  cookie: string,
  csrfToken: string,
  path: string,
  init: RequestInit = {},
) {
  const headers = new Headers(init.headers || {});
  if (!headers.has("Content-Type") && init.body) headers.set("Content-Type", "application/json");
  if (cookie) headers.set("Cookie", cookie);
  if (csrfToken && init.method && init.method !== "GET") headers.set("x-csrf-token", csrfToken);
  const res = await fetch(`${baseUrl}${path}`, { ...init, headers });
  const body = (await res.json()) as JsonBody;
  return { status: res.status, body };
}
