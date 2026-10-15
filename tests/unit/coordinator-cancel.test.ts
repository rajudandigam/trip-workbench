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
});
