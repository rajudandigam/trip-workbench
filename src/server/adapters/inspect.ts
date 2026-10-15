import fs from "node:fs";
import path from "node:path";

/**
 * Minimal AgentInspect-compatible JSONL trace writer for server/eval evidence.
 * Kept off the critical authorization path; failures never affect request outcomes.
 */
export function inspectRun<T>(
  name: string,
  fn: () => Promise<T>,
  opts: { traceDir?: string; silent?: boolean } = {},
): Promise<T> {
  const traceDir = opts.traceDir || path.resolve(process.cwd(), ".agent-inspect");
  const runId = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const file = path.join(traceDir, `${name}-${runId}.jsonl`);
  const write = (event: Record<string, unknown>) => {
    try {
      fs.mkdirSync(traceDir, { recursive: true });
      fs.appendFileSync(file, `${JSON.stringify({ runId, name, ...event })}\n`);
    } catch {
      /* ignore trace IO errors */
    }
  };
  write({ type: "run.start", at: new Date().toISOString() });
  return fn()
    .then((result) => {
      write({ type: "run.end", ok: true, at: new Date().toISOString() });
      if (!opts.silent) {
        console.log(JSON.stringify({ inspect: name, file, ok: true }));
      }
      return result;
    })
    .catch((error) => {
      write({
        type: "run.end",
        ok: false,
        error: (error as Error).message,
        at: new Date().toISOString(),
      });
      throw error;
    });
}

export function inspectStep(fileHint: string, step: string, data: Record<string, unknown>) {
  try {
    const traceDir = path.resolve(process.cwd(), ".agent-inspect");
    fs.mkdirSync(traceDir, { recursive: true });
    const file = path.join(traceDir, `${fileHint}.jsonl`);
    fs.appendFileSync(
      file,
      `${JSON.stringify({ type: "step", step, at: new Date().toISOString(), ...data })}\n`,
    );
  } catch {
    /* ignore */
  }
}
