import { describe, expect, it, vi } from "vitest";
import { createCoordinator } from "../../src/client/lib/coordinator.js";
import type { TripFields, TripView } from "../../src/domain/types.js";
import { defaultTripFields } from "../../src/domain/types.js";

function tripView(revision = 1): TripView {
  return {
    id: "draft-a",
    revision,
    status: "draft",
    fields: { ...defaultTripFields(), purpose: "Workshop" },
    createdAt: "2026-10-14T19:00:00.000Z",
    updatedAt: "2026-10-14T19:00:00.000Z",
  };
}

describe("cancellation and outcome recovery", () => {
  it("reconciles via command receipt after network loss (CANCEL-POSTDISPATCH)", async () => {
    let receiptReady = false;
    const fetchImpl = vi.fn(async (path: string, init?: RequestInit) => {
      if (path.endsWith("/draft-a") && !init?.method) {
        return { ok: true as const, data: tripView(receiptReady ? 2 : 1) };
      }
      if (init?.method === "PATCH") {
        return {
          ok: false as const,
          error: { code: "NETWORK_ERROR", message: "socket hang up" },
        };
      }
      if (path.includes("/commands/cmd-1")) {
        if (!receiptReady) {
          return { ok: false as const, error: { code: "NOT_FOUND", message: "missing" } };
        }
        return {
          ok: true as const,
          data: {
            commandId: "cmd-1",
            outcome: "applied" as const,
            tripId: "draft-a",
            fromRevision: 1,
            toRevision: 2,
            fields: { ...defaultTripFields(), destination: "JFK", purpose: "Workshop" } satisfies TripFields,
            status: "draft" as const,
            action: "update",
          },
        };
      }
      throw new Error(path);
    });

    const coordinator = createCoordinator({ fetchImpl: fetchImpl as never });
    await coordinator.openDraft("draft-a");

    // First attempt: network error, receipt not ready yet -> OUTCOME_UNKNOWN
    const first = await coordinator.applyAgentPatch({ destination: "JFK" }, 1, "cmd-1");
    expect(first.ok).toBe(false);
    if (!first.ok) expect(first.error.code).toBe("OUTCOME_UNKNOWN");
    expect(coordinator.getState().saving).toBe(false);
    expect(coordinator.getState().pendingOutcome?.commandId).toBe("cmd-1");

    // Patch must not have been retried with a new command id
    const patchCalls = fetchImpl.mock.calls.filter((c) => c[1]?.method === "PATCH");
    expect(patchCalls).toHaveLength(1);

    receiptReady = true;
    const recheck = await coordinator.recheckOutcome();
    expect(recheck.ok).toBe(true);
    expect(coordinator.getState().savedDraft?.revision).toBe(2);
    expect(coordinator.getState().savedDraft?.fields.destination).toBe("JFK");
    expect(coordinator.getState().pendingOutcome).toBeNull();
  });

  it("does not permanently stick saving=true after network rejection", async () => {
    const fetchImpl = vi.fn(async (path: string, init?: RequestInit) => {
      if (path.endsWith("/draft-a") && !init?.method) return { ok: true as const, data: tripView() };
      if (init?.method === "PATCH") {
        return { ok: false as const, error: { code: "NETWORK_ERROR", message: "boom" } };
      }
      if (path.includes("/commands/")) {
        return { ok: false as const, error: { code: "NOT_FOUND", message: "none" } };
      }
      throw new Error(path);
    });
    const coordinator = createCoordinator({ fetchImpl: fetchImpl as never });
    await coordinator.openDraft("draft-a");
    await coordinator.applyAgentPatch({ destination: "JFK" }, 1, "cmd-x");
    expect(coordinator.getState().saving).toBe(false);
  });

  it("preserves intervening local edits when rechecking an uncertain update", async () => {
    let receiptReady = false;
    const fetchImpl = vi.fn(async (path: string, init?: RequestInit) => {
      if (path.endsWith("/draft-a") && !init?.method) {
        return { ok: true as const, data: tripView(1) };
      }
      if (init?.method === "PATCH") {
        return {
          ok: false as const,
          error: { code: "NETWORK_ERROR", message: "socket hang up" },
        };
      }
      if (path.includes("/commands/cmd-keep")) {
        if (!receiptReady) {
          return { ok: false as const, error: { code: "NOT_FOUND", message: "missing" } };
        }
        return {
          ok: true as const,
          data: {
            commandId: "cmd-keep",
            outcome: "applied" as const,
            tripId: "draft-a",
            fromRevision: 1,
            toRevision: 2,
            fields: {
              ...defaultTripFields(),
              destination: "JFK",
              purpose: "Workshop",
            } satisfies TripFields,
            status: "draft" as const,
            action: "update",
          },
        };
      }
      throw new Error(path);
    });

    const coordinator = createCoordinator({ fetchImpl: fetchImpl as never });
    await coordinator.openDraft("draft-a");
    await coordinator.applyAgentPatch({ destination: "JFK" }, 1, "cmd-keep");
    expect(coordinator.getState().pendingOutcome?.commandId).toBe("cmd-keep");
    expect(coordinator.getState().pendingOutcome?.ctx.localAtDispatch.purpose).toBe("Workshop");

    coordinator.updateLocalField("purpose", "Edited after uncertainty");
    receiptReady = true;
    const recheck = await coordinator.recheckOutcome({
      draftId: "draft-a",
      commandId: "cmd-keep",
    });
    expect(recheck.ok).toBe(true);
    expect(coordinator.getState().savedDraft?.fields.destination).toBe("JFK");
    expect(coordinator.getState().localFields?.purpose).toBe("Edited after uncertainty");
    expect(coordinator.getState().dirty).toBe(true);
    expect(coordinator.getState().pendingOutcome).toBeNull();
  });

  it("bounds a stalled receipt lookup and releases saving", async () => {
    const fetchImpl = vi.fn(async (path: string, init?: RequestInit) => {
      if (path.endsWith("/draft-a") && !init?.method) return { ok: true as const, data: tripView() };
      if (init?.method === "PATCH") {
        return { ok: false as const, error: { code: "NETWORK_ERROR", message: "dropped" } };
      }
      if (path.includes("/commands/stall")) {
        // Never resolves until aborted by the per-attempt timeout.
        return new Promise(() => undefined);
      }
      throw new Error(path);
    });
    const coordinator = createCoordinator({ fetchImpl: fetchImpl as never });
    await coordinator.openDraft("draft-a");
    const started = Date.now();
    const res = await coordinator.applyAgentPatch({ purpose: "Changed" }, 1, "stall");
    const elapsed = Date.now() - started;
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("OUTCOME_UNKNOWN");
    expect(elapsed).toBeLessThan(3500);
    expect(coordinator.getState().saving).toBe(false);
    expect(coordinator.getState().pendingOutcome?.kind).toBe("update");
  });

  it("releases the operation after an expired session during receipt lookup", async () => {
    const fetchImpl = vi.fn(async (path: string, init?: RequestInit) => {
      if (path.endsWith("/draft-a") && !init?.method) return { ok: true as const, data: tripView() };
      if (init?.method === "PATCH") {
        return { ok: false as const, error: { code: "NETWORK_ERROR", message: "dropped" } };
      }
      if (path.includes("/commands/")) {
        return { ok: false as const, error: { code: "UNAUTHENTICATED", message: "expired" } };
      }
      throw new Error(path);
    });
    const coordinator = createCoordinator({ fetchImpl: fetchImpl as never });
    await coordinator.openDraft("draft-a");
    const first = await coordinator.applyAgentPatch({ purpose: "Changed" }, 1, "expired");
    expect(first.ok).toBe(false);
    if (!first.ok) expect(first.error.code).toBe("UNAUTHENTICATED");
    expect(coordinator.getState().saving).toBe(false);
    const second = await coordinator.applyAgentPatch({ purpose: "Again" }, 1, "again");
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error.code).not.toBe("COMMAND_IN_PROGRESS");
  });

  it("recovers a delayed successful receipt without redispatching", async () => {
    let attempts = 0;
    const fields = { ...defaultTripFields(), purpose: "Workshop", destination: "BOS" };
    const fetchImpl = vi.fn(async (path: string, init?: RequestInit) => {
      if (path.endsWith("/draft-a") && !init?.method) return { ok: true as const, data: tripView() };
      if (init?.method === "PATCH") {
        return { ok: false as const, error: { code: "NETWORK_ERROR", message: "dropped" } };
      }
      if (path.includes("/commands/delayed")) {
        attempts += 1;
        if (attempts < 2) {
          return { ok: false as const, error: { code: "NOT_FOUND", message: "not yet" } };
        }
        return {
          ok: true as const,
          data: {
            commandId: "delayed",
            outcome: "applied" as const,
            tripId: "draft-a",
            fromRevision: 1,
            toRevision: 2,
            fields,
            status: "draft" as const,
            action: "update",
          },
        };
      }
      throw new Error(path);
    });
    const coordinator = createCoordinator({ fetchImpl: fetchImpl as never });
    await coordinator.openDraft("draft-a");
    const res = await coordinator.applyAgentPatch({ destination: "BOS" }, 1, "delayed");
    expect(res.ok).toBe(true);
    expect(coordinator.getState().savedDraft?.fields.destination).toBe("BOS");
    expect(coordinator.getState().saving).toBe(false);
    expect(fetchImpl.mock.calls.filter((c) => c[1]?.method === "PATCH")).toHaveLength(1);
  });

  it("tracks submit uncertainty and rechecks without a second POST", async () => {
    let receiptReady = false;
    let postCount = 0;
    const fields = { ...defaultTripFields(), purpose: "Workshop" };
    const fetchImpl = vi.fn(async (path: string, init?: RequestInit) => {
      if (path.endsWith("/draft-a") && !init?.method) {
        return { ok: true as const, data: tripView(1) };
      }
      if (path.endsWith("/submit") && init?.method === "POST") {
        postCount += 1;
        return { ok: false as const, error: { code: "NETWORK_ERROR", message: "dropped" } };
      }
      if (path.includes("/commands/")) {
        if (!receiptReady) {
          return { ok: false as const, error: { code: "NOT_FOUND", message: "hidden" } };
        }
        return {
          ok: true as const,
          data: {
            commandId: String(path.split("/").pop()),
            outcome: "applied" as const,
            tripId: "draft-a",
            fromRevision: 1,
            toRevision: 2,
            fields,
            status: "submitted" as const,
            action: "submit",
          },
        };
      }
      throw new Error(path);
    });
    const coordinator = createCoordinator({ fetchImpl: fetchImpl as never });
    await coordinator.openDraft("draft-a");
    const first = await coordinator.submit(1, "demo-policy-v1");
    expect(first.ok).toBe(false);
    if (!first.ok) expect(first.error.code).toBe("OUTCOME_UNKNOWN");
    expect(coordinator.getState().pendingOutcome?.kind).toBe("submit");
    expect(coordinator.getState().saving).toBe(false);

    const again = await coordinator.submit(1, "demo-policy-v1");
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.code).toBe("OUTCOME_UNKNOWN");
    expect(postCount).toBe(1);

    receiptReady = true;
    const recheck = await coordinator.recheckOutcome();
    expect(recheck.ok).toBe(true);
    expect(coordinator.getState().savedDraft?.status).toBe("submitted");
    expect(coordinator.getState().pendingOutcome).toBeNull();
    expect(postCount).toBe(1);
  });
});
