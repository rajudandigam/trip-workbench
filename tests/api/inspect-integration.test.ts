import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openTraceFile } from "agent-inspect/readers";
import { authedJson, login, startTestApp } from "./helpers.js";
import { shutdownInspectAdapter } from "../../src/server/adapters/inspect.js";

describe("inspect API integration", () => {
  let close: (() => Promise<void>) | undefined;
  let traceDir: string | undefined;
  const prevInspect = process.env.TW_AGENT_INSPECT;
  const prevDir = process.env.TW_AGENT_INSPECT_DIR;

  afterEach(async () => {
    if (close) await close();
    close = undefined;
    await shutdownInspectAdapter();
    if (traceDir) fs.rmSync(traceDir, { recursive: true, force: true });
    traceDir = undefined;
    if (prevInspect === undefined) delete process.env.TW_AGENT_INSPECT;
    else process.env.TW_AGENT_INSPECT = prevInspect;
    if (prevDir === undefined) delete process.env.TW_AGENT_INSPECT_DIR;
    else process.env.TW_AGENT_INSPECT_DIR = prevDir;
  });

  it("records correlated trip-update and receipt traces without leaking sentinels", async () => {
    traceDir = fs.mkdtempSync(path.join(os.tmpdir(), "tw-inspect-api-"));
    process.env.TW_AGENT_INSPECT = "1";
    process.env.TW_AGENT_INSPECT_DIR = traceDir;
    await shutdownInspectAdapter();

    const app = await startTestApp();
    // Restore env immediately so parallel API files do not inherit inspect-on.
    if (prevInspect === undefined) delete process.env.TW_AGENT_INSPECT;
    else process.env.TW_AGENT_INSPECT = prevInspect;
    if (prevDir === undefined) delete process.env.TW_AGENT_INSPECT_DIR;
    else process.env.TW_AGENT_INSPECT_DIR = prevDir;
    close = app.close;
    const { cookie, csrfToken } = await login(app.baseUrl, "alex@northstar.demo");

    const created = await authedJson(app.baseUrl, cookie, csrfToken, "/api/trips", {
      method: "POST",
      body: JSON.stringify({ commandId: "inspect-create-1" }),
    });
    expect(created.status).toBe(201);
    const tripId = String(created.body.data?.tripId);

    const patched = await authedJson(app.baseUrl, cookie, csrfToken, `/api/trips/${tripId}`, {
      method: "PATCH",
      body: JSON.stringify({
        expectedRevision: 1,
        commandId: "inspect-patch-1",
        patch: {
          destination: "JFK",
          departureDate: "2026-11-12",
          returnDate: "2026-11-15",
          purpose: "SENTINEL_PURPOSE_SHOULD_NOT_APPEAR",
        },
      }),
    });
    expect(patched.status).toBe(200);
    expect(patched.body.ok).toBe(true);
    expect(patched.body.data?.outcome).toBe("applied");

    const receipt = await authedJson(
      app.baseUrl,
      cookie,
      csrfToken,
      `/api/trips/${tripId}/commands/inspect-patch-1`,
    );
    expect(receipt.status).toBe(200);
    expect(receipt.body.data?.outcome).toBe("applied");

    await shutdownInspectAdapter();
    const files = fs
      .readdirSync(traceDir)
      .filter((n) => n.endsWith(".jsonl"))
      .map((n) => path.join(traceDir!, n));
    expect(files.length).toBeGreaterThanOrEqual(2);

    const allText = files.map((f) => fs.readFileSync(f, "utf8")).join("\n");
    expect(allText).not.toContain("SENTINEL_PURPOSE_SHOULD_NOT_APPEAR");

    let sawUpdate = false;
    let sawReceipt = false;
    for (const file of files) {
      const opened = await openTraceFile(file);
      expect(opened.events.length).toBeGreaterThan(0);
      const runIds = [...new Set(opened.events.map((e) => e.runId))];
      expect(runIds).toHaveLength(1);
      const names = opened.events.map((e) => e.name);
      if (names.includes("trip-update")) {
        sawUpdate = true;
        expect(names).toContain("trip.patch");
        expect(names).toContain("trip.patch.receipt");
        const patchStep = opened.events.find((e) => e.name === "trip.patch");
        expect(patchStep?.runId).toBe(runIds[0]);
      }
      if (names.includes("trip-command-receipt")) {
        sawReceipt = true;
        expect(names).toContain("trip.command.read");
      }
    }
    expect(sawUpdate).toBe(true);
    expect(sawReceipt).toBe(true);
  });

  it("keeps business failure semantics when inspect is enabled", async () => {
    traceDir = fs.mkdtempSync(path.join(os.tmpdir(), "tw-inspect-api-fail-"));
    process.env.TW_AGENT_INSPECT = "1";
    process.env.TW_AGENT_INSPECT_DIR = traceDir;
    await shutdownInspectAdapter();

    const app = await startTestApp();
    if (prevInspect === undefined) delete process.env.TW_AGENT_INSPECT;
    else process.env.TW_AGENT_INSPECT = prevInspect;
    if (prevDir === undefined) delete process.env.TW_AGENT_INSPECT_DIR;
    else process.env.TW_AGENT_INSPECT_DIR = prevDir;
    close = app.close;
    const { cookie, csrfToken } = await login(app.baseUrl, "alex@northstar.demo");
    const created = await authedJson(app.baseUrl, cookie, csrfToken, "/api/trips", {
      method: "POST",
      body: JSON.stringify({ commandId: "inspect-create-2" }),
    });
    const tripId = String(created.body.data?.tripId);

    await authedJson(app.baseUrl, cookie, csrfToken, `/api/trips/${tripId}`, {
      method: "PATCH",
      body: JSON.stringify({
        expectedRevision: 1,
        commandId: "inspect-patch-ok",
        patch: { destination: "JFK", purpose: "x" },
      }),
    });

    const stale = await authedJson(app.baseUrl, cookie, csrfToken, `/api/trips/${tripId}`, {
      method: "PATCH",
      body: JSON.stringify({
        expectedRevision: 1,
        commandId: "inspect-patch-stale",
        patch: { purpose: "y" },
      }),
    });
    expect(stale.status).toBe(409);
    expect(stale.body.error?.code).toBe("REVISION_CONFLICT");
  });
});
