import { describe, expect, it, vi } from "vitest";
import { createCoordinator } from "../../src/client/lib/coordinator.js";
import type { ApiEnvelope } from "../../src/client/lib/api.js";
import type { TripFields, TripView } from "../../src/domain/types.js";
import { defaultTripFields } from "../../src/domain/types.js";

function tripView(overrides: Partial<TripView> = {}, fieldOverrides: Partial<TripFields> = {}): TripView {
  const fields = { ...defaultTripFields(), purpose: "Workshop", ...fieldOverrides };
  return {
    id: overrides.id || "draft-a",
    revision: overrides.revision ?? 1,
    status: "draft",
    fields,
    createdAt: "2026-10-14T19:00:00.000Z",
    updatedAt: "2026-10-14T19:00:00.000Z",
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("coordinator races and isolation", () => {
  it("preserves human edits made during an agent update (RACE-INFLIGHT)", async () => {
    const patchGate = deferred<ApiEnvelope<{
      outcome: string;
      toRevision: number;
      fields: TripFields;
      tripId: string;
      commandId: string;
    }>>();
    const fetchImpl = vi.fn(async (path: string, init?: RequestInit) => {
      if (path.endsWith("/draft-a") && init?.method === "PATCH") {
        return patchGate.promise;
      }
      if (path.endsWith("/draft-a") && !init?.method) {
        return { ok: true as const, data: tripView() };
      }
      throw new Error(`unexpected ${path} ${init?.method}`);
    });

    const coordinator = createCoordinator({ fetchImpl: fetchImpl as never });
    await coordinator.openDraft("draft-a");
    const pending = coordinator.applyAgentPatch(
      { destination: "JFK" },
      1,
      "agent-1",
    );
    coordinator.updateLocalField("purpose", "Leadership meeting");
    patchGate.resolve({
      ok: true,
      data: {
        outcome: "applied",
        toRevision: 2,
        fields: { ...defaultTripFields(), destination: "JFK", purpose: "Workshop" },
        tripId: "draft-a",
        commandId: "agent-1",
      },
    });
    const res = await pending;
    expect(res.ok).toBe(true);
    const state = coordinator.getState();
    expect(state.savedDraft?.revision).toBe(2);
    expect(state.savedDraft?.fields.destination).toBe("JFK");
    expect(state.savedDraft?.fields.purpose).toBe("Workshop");
    expect(state.localFields?.destination).toBe("JFK");
    expect(state.localFields?.purpose).toBe("Leadership meeting");
    expect(state.dirty).toBe(true);
  });

  it("keeps the latest same-draft openDraft and ignores a superseded load", async () => {
    const firstGate = deferred<ApiEnvelope<TripView>>();
    const fetchImpl = vi.fn(async (path: string, init?: RequestInit) => {
      if (path.endsWith("/draft-a") && !init?.method) {
        if (fetchImpl.mock.calls.filter((c) => String(c[0]).endsWith("/draft-a") && !c[1]?.method).length === 1) {
          return firstGate.promise;
        }
        return { ok: true as const, data: tripView({ revision: 3 }, { purpose: "latest" }) };
      }
      throw new Error(path);
    });
    const coordinator = createCoordinator({ fetchImpl: fetchImpl as never });
    const first = coordinator.openDraft("draft-a");
    const second = await coordinator.openDraft("draft-a");
    firstGate.resolve({ ok: true, data: tripView({ revision: 1 }, { purpose: "stale" }) });
    const firstRes = await first;
    expect(firstRes.ok).toBe(false);
    if (!firstRes.ok) expect(firstRes.error.code).toBe("CONTEXT_MISMATCH");
    expect(second.ok).toBe(true);
    expect(coordinator.getState().savedDraft?.revision).toBe(3);
    expect(coordinator.getState().localFields?.purpose).toBe("latest");
  });

  it("ignores a late response after switching drafts", async () => {
    const patchGate = deferred<ApiEnvelope<{
      outcome: string;
      toRevision: number;
      fields: TripFields;
      tripId: string;
      commandId: string;
    }>>();
    const fetchImpl = vi.fn(async (path: string, init?: RequestInit) => {
      if (path.includes("draft-a") && init?.method === "PATCH") return patchGate.promise;
      if (path.endsWith("/draft-a")) return { ok: true as const, data: tripView({ id: "draft-a" }) };
      if (path.endsWith("/draft-b")) {
        return {
          ok: true as const,
          data: tripView({ id: "draft-b" }, { purpose: "B" }),
        };
      }
      throw new Error(path);
    });
    const coordinator = createCoordinator({ fetchImpl: fetchImpl as never });
    await coordinator.openDraft("draft-a");
    const pending = coordinator.applyAgentPatch({ destination: "JFK" }, 1, "agent-a");
    await coordinator.openDraft("draft-b");
    patchGate.resolve({
      ok: true,
      data: {
        outcome: "applied",
        toRevision: 2,
        fields: { ...defaultTripFields(), destination: "JFK", purpose: "Workshop" },
        tripId: "draft-a",
        commandId: "agent-a",
      },
    });
    const res = await pending;
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("CONTEXT_MISMATCH");
    expect(coordinator.getState().savedDraft?.id).toBe("draft-b");
    expect(coordinator.getState().localFields?.purpose).toBe("B");
  });

  it("does not regress UI when a historical receipt arrives", async () => {
    let revision = 1;
    const fetchImpl = vi.fn(async (path: string, init?: RequestInit) => {
      if (path.endsWith("/draft-a") && !init?.method) {
        return {
          ok: true as const,
          data: tripView(
            { revision },
            {
              destination: revision >= 5 ? "JFK" : null,
              purpose: revision >= 5 ? "Final" : "Workshop",
            },
          ),
        };
      }
      if (init?.method === "PATCH") {
        const body = JSON.parse(String(init.body)) as { commandId: string };
        if (body.commandId === "old-receipt") {
          return {
            ok: true as const,
            data: {
              outcome: "applied",
              toRevision: 2,
              fields: { ...defaultTripFields(), destination: "JFK", purpose: "Workshop" },
              tripId: "draft-a",
              commandId: "old-receipt",
            },
          };
        }
      }
      throw new Error(path);
    });
    const coordinator = createCoordinator({ fetchImpl: fetchImpl as never });
    await coordinator.openDraft("draft-a");
    // Simulate already at revision 5
    revision = 5;
    await coordinator.refreshSavedDraft("draft-a");
    expect(coordinator.getState().savedDraft?.revision).toBe(5);
    const res = await coordinator.applyAgentPatch({ destination: "JFK" }, 5, "old-receipt");
    // Server returned historical toRevision 2 — UI must not move backward
    expect(res.ok).toBe(true);
    expect(coordinator.getState().savedDraft?.revision).toBe(5);
    expect(coordinator.getState().savedDraft?.fields.purpose).toBe("Final");
  });

  it("returns USER_EDIT_IN_PROGRESS with zero PATCH calls when dirty", async () => {
    const fetchImpl = vi.fn(async (path: string, _init?: RequestInit) => {
      if (path.endsWith("/draft-a")) return { ok: true as const, data: tripView() };
      throw new Error(path);
    });
    const coordinator = createCoordinator({ fetchImpl: fetchImpl as never });
    await coordinator.openDraft("draft-a");
    coordinator.updateLocalField("purpose", "typed");
    const res = await coordinator.applyAgentPatch({ destination: "JFK" }, 1, "x");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("USER_EDIT_IN_PROGRESS");
    expect(
      fetchImpl.mock.calls.some((c) => (c[1] as RequestInit | undefined)?.method === "PATCH"),
    ).toBe(false);
  });

  it("pre-aborted agent update sends zero PATCH requests", async () => {
    const fetchImpl = vi.fn(async (path: string, _init?: RequestInit) => {
      if (path.endsWith("/draft-a")) return { ok: true as const, data: tripView() };
      throw new Error(path);
    });
    const coordinator = createCoordinator({ fetchImpl: fetchImpl as never });
    await coordinator.openDraft("draft-a");
    const controller = new AbortController();
    controller.abort();
    const res = await coordinator.applyAgentPatch({ destination: "JFK" }, 1, "cmd", {
      signal: controller.signal,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("CANCELLED");
    expect(
      fetchImpl.mock.calls.some((c) => (c[1] as RequestInit | undefined)?.method === "PATCH"),
    ).toBe(false);
  });

  it("logout keeps CSRF until DELETE succeeds and does not clear UI on failure", async () => {
    const calls: Array<{ path: string; csrf: string | null }> = [];
    let csrf: string | null = "csrf-1";
    const fetchImpl = vi.fn(async (path: string, init?: RequestInit) => {
      const headers = new Headers(init?.headers || {});
      calls.push({ path, csrf: headers.get("x-csrf-token") });
      if (path === "/api/session" && init?.method === "DELETE") {
        return {
          ok: false as const,
          error: { code: "FORBIDDEN", message: "CSRF failed" },
        };
      }
      if (path === "/api/session" && init?.method === "POST") {
        csrf = "csrf-1";
        return {
          ok: true as const,
          data: {
            email: "alex@northstar.demo",
            displayName: "Alex",
            role: "traveler" as const,
            tenantId: "t",
            csrfToken: "csrf-1",
            capabilities: { canMutateTrips: true, aiMode: "fixture" },
          },
        };
      }
      throw new Error(path);
    });
    // Mirror api.ts CSRF module by wrapping
    const { setCsrfToken, getCsrfToken } = await import("../../src/client/lib/api.js");
    setCsrfToken("csrf-1");
    const wrapped = async (path: string, init?: RequestInit) => {
      const headers = new Headers(init?.headers || {});
      if (getCsrfToken() && init?.method && init.method !== "GET") {
        headers.set("x-csrf-token", getCsrfToken()!);
      }
      return fetchImpl(path, { ...init, headers });
    };
    const coordinator = createCoordinator({ fetchImpl: wrapped as never });
    await coordinator.login("alex@northstar.demo", "Password123!");
    expect(getCsrfToken()).toBe("csrf-1");
    const res = await coordinator.logout();
    expect(res.ok).toBe(false);
    expect(getCsrfToken()).toBe("csrf-1");
    expect(calls.some((c) => c.path === "/api/session" && c.csrf === "csrf-1")).toBe(true);
    void csrf;
  });

  it("marks Gemini proposal stale after local edits (RACE-PROPOSAL)", async () => {
    const fetchImpl = vi.fn(async (path: string, init?: RequestInit) => {
      if (path.endsWith("/draft-a") && !init?.method) {
        return { ok: true as const, data: tripView() };
      }
      if (path.includes("/proposal")) {
        return {
          ok: true as const,
          data: {
            proposal: { patch: { destination: "JFK" }, clarifications: [] },
            boundRevision: 1,
            boundClientEditVersion: 0,
            boundBriefVersion: 1,
            mode: "fixture",
          },
        };
      }
      throw new Error(path);
    });
    const coordinator = createCoordinator({ fetchImpl: fetchImpl as never });
    await coordinator.openDraft("draft-a");
    const proposal = await coordinator.requestProposal();
    expect(proposal?.ok).toBe(true);
    coordinator.updateLocalField("purpose", "changed");
    expect(
      proposal &&
        proposal.ok &&
        coordinator.isProposalStale({
          boundRevision: proposal.data.boundRevision,
          boundClientEditVersion: proposal.data.boundClientEditVersion,
          boundBriefVersion: proposal.data.boundBriefVersion,
        }),
    ).toBe(true);
  });

  it("clears CSRF only after successful logout", async () => {
    const { setCsrfToken, getCsrfToken } = await import("../../src/client/lib/api.js");
    setCsrfToken("csrf-ok");
    const fetchImpl = vi.fn(async (path: string, init?: RequestInit) => {
      const headers = new Headers(init?.headers || {});
      if (path === "/api/session" && init?.method === "DELETE") {
        expect(headers.get("x-csrf-token")).toBe("csrf-ok");
        return { ok: true as const, data: { signedOut: true } };
      }
      throw new Error(path);
    });
    const wrapped = async (path: string, init?: RequestInit) => {
      const headers = new Headers(init?.headers || {});
      if (getCsrfToken() && init?.method && init.method !== "GET") {
        headers.set("x-csrf-token", getCsrfToken()!);
      }
      return fetchImpl(path, { ...init, headers });
    };
    const coordinator = createCoordinator({ fetchImpl: wrapped as never });
    const res = await coordinator.logout();
    expect(res.ok).toBe(true);
    expect(getCsrfToken()).toBeNull();
  });
});
