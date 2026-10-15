import { afterEach, describe, expect, it } from "vitest";
import { authedJson, login, startTestApp } from "./helpers.js";

describe("trip API", () => {
  let close: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (close) await close();
    close = undefined;
  });

  it("creates, patches, validates, submits, and persists after reload", async () => {
    const app = await startTestApp();
    close = app.close;
    const { cookie, csrfToken } = await login(app.baseUrl, "alex@northstar.demo");

    const created = await authedJson(app.baseUrl, cookie, csrfToken, "/api/trips", {
      method: "POST",
      body: JSON.stringify({ commandId: "create-1" }),
    });
    expect(created.status).toBe(201);
    expect(created.body.ok).toBe(true);
    const tripId = String(created.body.data?.tripId);

    const patched = await authedJson(app.baseUrl, cookie, csrfToken, `/api/trips/${tripId}`, {
      method: "PATCH",
      body: JSON.stringify({
        expectedRevision: 1,
        commandId: "patch-1",
        patch: {
          destination: "JFK",
          departureDate: "2026-11-12",
          returnDate: "2026-11-15",
          purpose: "customer workshop",
        },
      }),
    });
    expect(patched.body.ok).toBe(true);
    expect(patched.body.data?.toRevision).toBe(2);

    const replay = await authedJson(app.baseUrl, cookie, csrfToken, `/api/trips/${tripId}`, {
      method: "PATCH",
      body: JSON.stringify({
        expectedRevision: 1,
        commandId: "patch-1",
        patch: {
          destination: "JFK",
          departureDate: "2026-11-12",
          returnDate: "2026-11-15",
          purpose: "customer workshop",
        },
      }),
    });
    expect(replay.body.ok).toBe(true);
    expect(replay.body.data?.toRevision).toBe(2);

    const stale = await authedJson(app.baseUrl, cookie, csrfToken, `/api/trips/${tripId}`, {
      method: "PATCH",
      body: JSON.stringify({
        expectedRevision: 1,
        commandId: "patch-2",
        patch: { purpose: "other" },
      }),
    });
    expect(stale.status).toBe(409);
    expect(stale.body.error?.code).toBe("REVISION_CONFLICT");

    const staleValidate = await authedJson(
      app.baseUrl,
      cookie,
      csrfToken,
      `/api/trips/${tripId}/validate`,
      { method: "POST", body: JSON.stringify({ expectedRevision: 1 }) },
    );
    expect(staleValidate.status).toBe(409);
    expect(staleValidate.body.error?.code).toBe("REVISION_CONFLICT");

    const validated = await authedJson(
      app.baseUrl,
      cookie,
      csrfToken,
      `/api/trips/${tripId}/validate`,
      { method: "POST", body: JSON.stringify({ expectedRevision: 2 }) },
    );
    expect(validated.body.data?.canSubmit).toBe(true);

    const submitted = await authedJson(
      app.baseUrl,
      cookie,
      csrfToken,
      `/api/trips/${tripId}/submit`,
      {
        method: "POST",
        body: JSON.stringify({
          expectedRevision: 2,
          reviewedPolicyVersion: "demo-policy-v1",
          commandId: "submit-1",
        }),
      },
    );
    expect(submitted.body.ok).toBe(true);
    expect(submitted.body.data?.status).toBe("submitted");

    const reloaded = await authedJson(app.baseUrl, cookie, csrfToken, `/api/trips/${tripId}`);
    expect(reloaded.body.data?.status).toBe("submitted");
    expect((reloaded.body.data?.fields as { purpose?: string } | undefined)?.purpose).toBe(
      "customer workshop",
    );
  });

  it("enforces tenant and observer permissions", async () => {
    const app = await startTestApp();
    close = app.close;
    const alex = await login(app.baseUrl, "alex@northstar.demo");
    const created = await authedJson(app.baseUrl, alex.cookie, alex.csrfToken, "/api/trips", {
      method: "POST",
      body: JSON.stringify({ commandId: "create-alex" }),
    });
    const tripId = String(created.body.data?.tripId);

    const jordan = await login(app.baseUrl, "jordan@northstar.demo");
    const other = await authedJson(app.baseUrl, jordan.cookie, jordan.csrfToken, `/api/trips/${tripId}`);
    expect(other.status).toBe(404);

    const observer = await login(app.baseUrl, "observer@northstar.demo");
    const read = await authedJson(
      app.baseUrl,
      observer.cookie,
      observer.csrfToken,
      `/api/trips/${tripId}`,
    );
    expect(read.status).toBe(200);
    const mutate = await authedJson(
      app.baseUrl,
      observer.cookie,
      observer.csrfToken,
      `/api/trips/${tripId}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          expectedRevision: 1,
          commandId: "obs-1",
          patch: { purpose: "nope" },
        }),
      },
    );
    expect(mutate.status).toBe(403);

    const casey = await login(app.baseUrl, "casey@cedar.demo");
    const cross = await authedJson(app.baseUrl, casey.cookie, casey.csrfToken, `/api/trips/${tripId}`);
    expect(cross.status).toBe(404);
  });

  it("returns fixture Gemini proposal without mutating", async () => {
    const app = await startTestApp();
    close = app.close;
    const alex = await login(app.baseUrl, "alex@northstar.demo");
    const created = await authedJson(app.baseUrl, alex.cookie, alex.csrfToken, "/api/trips", {
      method: "POST",
      body: JSON.stringify({ commandId: "create-ai" }),
    });
    const tripId = String(created.body.data?.tripId);
    const before = await authedJson(app.baseUrl, alex.cookie, alex.csrfToken, `/api/trips/${tripId}`);
    const proposal = await authedJson(
      app.baseUrl,
      alex.cookie,
      alex.csrfToken,
      `/api/trips/${tripId}/proposal`,
      {
        method: "POST",
        body: JSON.stringify({
          brief:
            "Prepare a round trip from SFO to JFK, departing November 12, 2026 and returning November 15, 2026, for one traveler in economy. Purpose: customer workshop.",
          expectedRevision: before.body.data?.revision,
          clientEditVersion: 0,
          briefVersion: 1,
        }),
      },
    );
    expect(proposal.body.ok).toBe(true);
    expect(proposal.body.data?.mode).toBe("fixture");
    expect(
      (proposal.body.data?.proposal as { patch?: { destination?: string } } | undefined)?.patch
        ?.destination,
    ).toBe("JFK");
    const after = await authedJson(app.baseUrl, alex.cookie, alex.csrfToken, `/api/trips/${tripId}`);
    expect(after.body.data?.revision).toBe(before.body.data?.revision);
  });
});
