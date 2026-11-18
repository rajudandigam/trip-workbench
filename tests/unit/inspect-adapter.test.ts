import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openTraceFile } from "agent-inspect/readers";
import { createToolUsageRule, runTraceChecks } from "agent-inspect/checks";
import {
  allowlistMetadata,
  businessMemoCanary,
  getInspectAdapter,
  inspectRun,
  inspectStep,
  shutdownInspectAdapter,
} from "../../src/server/adapters/inspect.js";

async function listTraceFiles(dir: string): Promise<string[]> {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".jsonl"))
    .map((name) => path.join(dir, name));
}

describe("inspect adapter", () => {
  const dirs: string[] = [];

  afterEach(async () => {
    await shutdownInspectAdapter();
    for (const dir of dirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("allowlists only explicit keys and drops unrecognized canaries", () => {
    expect(
      allowlistMetadata({
        domain: "trip",
        operation: "update",
        brief: "secret brief",
        purpose: "honeymoon",
        email: "alex@example.com",
        businessMemo: businessMemoCanary(),
        inventedKey: "should-drop",
        commandOutcome: "applied",
        fromRevision: 1,
        toRevision: 2,
      } as Record<string, unknown>),
    ).toEqual({
      domain: "trip",
      operation: "update",
      commandOutcome: "applied",
      fromRevision: 1,
      toRevision: 2,
    });
  });

  it("persists no businessMemo canary in flushed JSONL", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tw-inspect-canary-"));
    dirs.push(dir);
    getInspectAdapter({ enabled: true, traceDir: dir });
    const canary = businessMemoCanary();

    const poisoned = {
      domain: "trip" as const,
      operation: "update",
      resourceAlias: "trip-canary",
      businessMemo: canary,
    };

    await inspectRun(
      "trip-update",
      async () => {
        await inspectStep("trip.patch", async () => ({ ok: true }), {
          type: "tool",
          // Intentionally inject an unrecognized key; allowlist must drop it.
          metadata: poisoned as typeof poisoned & { domain: "trip" },
        });
        return "ok";
      },
      {
        enabled: true,
        traceDir: dir,
        metadata: poisoned as typeof poisoned & { domain: "trip" },
      },
    );

    await shutdownInspectAdapter();
    const files = await listTraceFiles(dir);
    expect(files.length).toBe(1);
    const body = fs.readFileSync(files[0]!, "utf8");
    expect(body).not.toContain(canary);
    expect(body).not.toContain("businessMemo");
    expect(body).toContain("trip-canary");
  });

  it("disabled mode produces no trace files and preserves return/throw", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tw-inspect-off-"));
    dirs.push(dir);
    getInspectAdapter({ enabled: false, traceDir: dir });

    await expect(
      inspectRun("noop", async () => "ok", { enabled: false, traceDir: dir }),
    ).resolves.toBe("ok");

    await expect(
      inspectRun(
        "boom",
        async () => {
          throw Object.assign(new Error("business failed"), { code: "REVISION_CONFLICT" });
        },
        { enabled: false, traceDir: dir },
      ),
    ).rejects.toMatchObject({ code: "REVISION_CONFLICT", message: "business failed" });

    expect(await listTraceFiles(dir)).toEqual([]);
  });

  it("enabled happy path writes a readable correlated run with child steps", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tw-inspect-on-"));
    dirs.push(dir);
    getInspectAdapter({ enabled: true, traceDir: dir });

    const value = await inspectRun(
      "trip-update",
      async () => {
        const receipt = await inspectStep(
          "trip.patch",
          async () => ({
            commandId: "cmd-1",
            outcome: "applied" as const,
            tripId: "trip-1",
            fromRevision: 1,
            toRevision: 2,
            action: "update_trip",
          }),
          {
            type: "tool",
            metadata: {
              domain: "trip",
              operation: "update",
              resourceAlias: "trip-1",
              commandAlias: "cmd-1",
            },
          },
        );
        await inspectStep("trip.patch.receipt", async () => undefined, {
          metadata: {
            domain: "trip",
            commandOutcome: receipt.outcome,
            fromRevision: receipt.fromRevision,
            toRevision: receipt.toRevision,
            captureStatus: "complete",
          },
        });
        return receipt;
      },
      {
        enabled: true,
        traceDir: dir,
        metadata: { domain: "trip", operation: "update" },
      },
    );

    expect(value.outcome).toBe("applied");
    await shutdownInspectAdapter();

    const files = await listTraceFiles(dir);
    expect(files.length).toBe(1);
    const read = await openTraceFile(files[0]!);
    expect(read.events.length).toBeGreaterThan(0);
    const runIds = [...new Set(read.events.map((e) => e.runId))];
    expect(runIds).toHaveLength(1);
    const names = read.events.map((e) => e.name);
    expect(names).toContain("trip-update");
    expect(names).toContain("trip.patch");
    expect(names).toContain("trip.patch.receipt");
    const child = read.events.find((e) => e.name === "trip.patch");
    expect(child?.parentId || child?.runId).toBeTruthy();

    const serialized = fs.readFileSync(files[0]!, "utf8");
    expect(serialized).not.toContain("honeymoon");
    expect(serialized).not.toContain("secret brief");

    const check = runTraceChecks(
      { read },
      { rules: [createToolUsageRule({ required: ["trip.patch"] })] },
    );
    expect(check.status).toBe("pass");
  });

  it("failed business path preserves thrown error and still writes error run", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tw-inspect-err-"));
    dirs.push(dir);
    getInspectAdapter({ enabled: true, traceDir: dir });

    const err = Object.assign(new Error("REVISION_CONFLICT: draft changed"), {
      code: "REVISION_CONFLICT",
    });
    await expect(
      inspectRun(
        "trip-update",
        async () => {
          await inspectStep("trip.patch", async () => {
            throw err;
          }, { type: "tool", metadata: { domain: "trip", operation: "update" } });
          return null;
        },
        { enabled: true, traceDir: dir },
      ),
    ).rejects.toBe(err);

    await shutdownInspectAdapter();
    const files = await listTraceFiles(dir);
    expect(files.length).toBe(1);
    const body = fs.readFileSync(files[0]!, "utf8");
    expect(body).not.toContain("draft changed");
    expect(body).toMatch(/REVISION_CONFLICT|"ERROR"/);
  });
});
