import { createClock, type Clock } from "../domain/clock.js";

export type AiMode = "disabled" | "fixture" | "live";

export type AppConfig = {
  nodeEnv: string;
  port: number;
  apiPort: number;
  databaseUrl: string;
  sessionSecret: string;
  cookieName: string;
  clock: Clock;
  allowedDbNamePattern: string;
  seedPassword: string;
  timeZone: string;
  aiMode: AiMode;
  geminiApiKey: string | null;
  geminiModel: string;
};

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

function parseAiMode(raw: string | undefined): AiMode {
  const v = (raw || "disabled").toLowerCase();
  if (v === "disabled" || v === "fixture" || v === "live") return v;
  throw new Error(`Invalid AI_MODE: ${raw}`);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const fixedNow = env.DEMO_FIXED_NOW;
  return {
    nodeEnv: env.NODE_ENV || "development",
    port: Number(env.PORT || 3000),
    apiPort: Number(env.API_PORT || 3001),
    databaseUrl: required("DATABASE_URL"),
    sessionSecret: required("SESSION_SECRET", "dev-only-session-secret-change-me"),
    cookieName: env.COOKIE_NAME || "tw_session",
    clock: createClock(fixedNow),
    allowedDbNamePattern: env.ALLOWED_DB_NAME_PATTERN || "trip_workbench",
    seedPassword: env.SEED_PASSWORD || "Password123!",
    timeZone: env.APP_TIMEZONE || "America/Los_Angeles",
    aiMode: parseAiMode(env.AI_MODE),
    geminiApiKey: env.GEMINI_API_KEY || null,
    geminiModel: env.GEMINI_MODEL || "gemini-2.5-flash",
  };
}

export function assertSafeDatabaseUrl(url: string, pattern: string): void {
  const parsed = new URL(url);
  const dbName = parsed.pathname.replace(/^\//, "");
  if (!dbName.includes(pattern)) {
    throw new Error(
      `Refusing database operation: database name "${dbName}" does not match allowed pattern "${pattern}"`,
    );
  }
  if (parsed.hostname === "prod" || dbName.includes("production")) {
    throw new Error(`Refusing destructive operation against unexpected host/db: ${dbName}`);
  }
}
