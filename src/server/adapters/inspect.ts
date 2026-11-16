/**
 * Optional, local-only AgentInspect diagnostics for server routes.
 *
 * Disabled by default. When enabled (`TW_AGENT_INSPECT=1`), uses an
 * application-owned createInspector + bufferedFileWriter. Failures never alter
 * application return values or thrown errors, and never retry business work.
 */
import path from "node:path";
import { createInspector, type Inspector } from "agent-inspect";
import { bufferedFileWriter, type TraceWriter } from "agent-inspect/writers";

export type InspectAllowlistMeta = {
  domain?: "trip" | "event" | "proposal";
  operation?: string;
  errorCode?: string;
  commandAction?: string;
  commandOutcome?: string;
  fromRevision?: number | null;
  toRevision?: number | null;
  expectedRevision?: number;
  replay?: boolean;
  resourceKind?: string;
  /** Opaque local correlation id (UUID); never a secret. */
  resourceAlias?: string;
  commandAlias?: string;
  captureStatus?: "complete" | "partial" | "failed";
  mode?: string;
  clarificationCount?: number;
};

const SENSITIVE_META_KEYS = new Set([
  "brief",
  "proposal",
  "prompt",
  "cookie",
  "csrf",
  "authorization",
  "password",
  "email",
  "purpose",
  "notes",
  "body",
  "stack",
  "message",
]);

let shared: {
  inspector: Inspector;
  writer: TraceWriter;
  enabled: boolean;
  traceDir: string;
} | null = null;

export function isAgentInspectEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const raw = (env.TW_AGENT_INSPECT || "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

function resolveTraceDir(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.TW_AGENT_INSPECT_DIR?.trim();
  if (configured) return path.resolve(configured);
  return path.resolve(process.cwd(), ".agent-inspect");
}

/** Strip free-form error text before disk; keep bounded code/category only. */
function projectingWriter(inner: TraceWriter): TraceWriter {
  return {
    async write(event) {
      let next = event;
      if (event.error && typeof event.error === "object") {
        const code =
          typeof (event.error as { code?: unknown }).code === "string"
            ? String((event.error as { code: string }).code).slice(0, 64)
            : "ERROR";
        next = {
          ...event,
          error: { message: code, code },
        };
      }
      if (next.attributes && typeof next.attributes === "object") {
        const attrs = { ...next.attributes };
        if ("errorStack" in attrs) delete attrs.errorStack;
        if (
          attrs.metadata &&
          typeof attrs.metadata === "object" &&
          !Array.isArray(attrs.metadata)
        ) {
          attrs.metadata = allowlistMetadata(attrs.metadata as Record<string, unknown>);
        }
        next = { ...next, attributes: attrs };
      }
      await inner.write(next);
    },
    flush: () => inner.flush?.() ?? Promise.resolve(),
    close: () => inner.close?.() ?? Promise.resolve(),
    getStats: () =>
      inner.getStats?.() ?? {
        writtenEvents: 0,
        droppedEvents: 0,
        flushCount: 0,
      },
  };
}

export function allowlistMetadata(
  input: Record<string, unknown> | InspectAllowlistMeta,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (SENSITIVE_META_KEYS.has(key.toLowerCase())) continue;
    if (value === undefined) continue;
    if (typeof value === "string") {
      out[key] = value.slice(0, 128);
      continue;
    }
    if (typeof value === "number" || typeof value === "boolean" || value === null) {
      out[key] = value;
      continue;
    }
  }
  return out;
}

/**
 * Get or create the process-wide inspector. Tests may pass overrides to isolate
 * output directories. Disabled mode returns an inspector with enabled:false so
 * run/step are no-ops that still preserve return values.
 *
 * Explicit `enabled` / `traceDir` replace the shared adapter so nested
 * `inspectStep` calls inside `inspectRun` share the same instance.
 */
export function getInspectAdapter(options?: {
  enabled?: boolean;
  traceDir?: string;
  env?: NodeJS.ProcessEnv;
}): { inspector: Inspector; enabled: boolean; traceDir: string; writer: TraceWriter } {
  const env = options?.env ?? process.env;
  const hasExplicit =
    options?.enabled !== undefined || options?.traceDir !== undefined;

  // Nested inspectStep calls omit options; keep the active shared adapter so a
  // request that enabled capture is not replaced by an env-default disabled one.
  if (!hasExplicit && shared) {
    return shared;
  }

  const enabled = options?.enabled ?? isAgentInspectEnabled(env);
  const traceDir = options?.traceDir ?? resolveTraceDir(env);

  if (shared && shared.enabled === enabled && shared.traceDir === traceDir) {
    return shared;
  }

  const inner = bufferedFileWriter({
    dir: traceDir,
    maxQueueSize: 500,
    flushIntervalMs: 100,
    overflow: "drop-oldest",
  });
  const writer = projectingWriter(inner);
  const inspector = createInspector({
    enabled,
    writer,
    traceDir,
    silent: true,
    capture: { onSuccess: "none", onError: "none" },
    metadata: { source: "trip-workbench", capture: "metadata-only" },
  });

  shared = { inspector, enabled, traceDir, writer };
  return shared;
}

export async function shutdownInspectAdapter(): Promise<void> {
  if (!shared) return;
  const current = shared;
  shared = null;
  try {
    await current.inspector.flush();
  } catch {
    /* ignore */
  }
  try {
    await current.inspector.close();
  } catch {
    /* ignore */
  }
}

/**
 * Run an observed request as its own AgentInspect run. Child steps must be
 * awaited inside `fn` so they share this run context.
 */
export async function inspectRun<T>(
  name: string,
  fn: () => Promise<T>,
  options?: {
    metadata?: InspectAllowlistMeta;
    traceDir?: string;
    enabled?: boolean;
    silent?: boolean;
  },
): Promise<T> {
  const { inspector, enabled } = getInspectAdapter({
    enabled: options?.enabled,
    traceDir: options?.traceDir,
  });
  if (!enabled) return fn();
  try {
    return await inspector.run(name, fn, {
      silent: options?.silent ?? true,
      metadata: options?.metadata
        ? allowlistMetadata(options.metadata)
        : undefined,
    });
  } catch (error) {
    // Preserve exact thrown value; instrumentation must not replace it.
    throw error;
  }
}

/**
 * Awaited child step inside the current inspectRun. Outside a run (or when
 * disabled), executes `fn` directly.
 */
export async function inspectStep<T>(
  name: string,
  fn: () => Promise<T>,
  options?: {
    type?: "logic" | "tool" | "llm";
    metadata?: InspectAllowlistMeta;
  },
): Promise<T> {
  const { inspector, enabled } = getInspectAdapter();
  if (!enabled) return fn();
  return inspector.step(name, fn, {
    type: options?.type ?? "logic",
    metadata: options?.metadata
      ? (allowlistMetadata(options.metadata) as Record<string, unknown>)
      : undefined,
  });
}
