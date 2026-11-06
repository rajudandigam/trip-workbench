import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { authedJson, login, startTestApp, type TestApp } from "./helpers.js";

describe("event API", () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await startTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("creates, patches, validates, and records an event draft", async () => {
    const alex = await login(app.baseUrl, "alex@northstar.demo");
    const created = await authedJson(app.baseUrl, alex.cookie, alex.csrfToken, "/api/events", {
      method: "POST",
      body: JSON.stringify({ commandId: "event-create-1" }),
    });
    expect(created.status).toBe(201);
    const eventId = String(created.body.data?.eventId);

    const patched = await authedJson(app.baseUrl, alex.cookie, alex.csrfToken, `/api/events/${eventId}`, {
      method: "PATCH",
      body: JSON.stringify({
        expectedRevision: 1,
        commandId: "event-patch-1",
        patch: {
          title: "Customer planning workshop",
          startDate: "2026-12-01",
          endDate: "2026-12-02",
          timeZone: "America/Los_Angeles",
          locationMode: "synthetic",
          locationLabel: "Northstar Demo Campus — Atrium",
        },
      }),
    });
    expect(patched.status).toBe(200);
    expect(patched.body.data?.toRevision).toBe(2);

    const validated = await authedJson(
      app.baseUrl,
      alex.cookie,
      alex.csrfToken,
      `/api/events/${eventId}/validate`,
      {
        method: "POST",
        body: JSON.stringify({ expectedRevision: 2 }),
      },
    );
    expect(validated.status).toBe(200);
    expect(validated.body.data?.valid).toBe(true);
    expect(validated.body.data?.canSubmit).toBe(true);

    const submitted = await authedJson(
      app.baseUrl,
      alex.cookie,
      alex.csrfToken,
      `/api/events/${eventId}/submit`,
      {
        method: "POST",
        body: JSON.stringify({
          expectedRevision: 2,
          reviewedPolicyVersion: "demo-event-policy-v1",
          commandId: "event-submit-1",
        }),
      },
    );
    expect(submitted.status).toBe(200);
    expect(submitted.body.data?.status).toBe("submitted");

    const reloaded = await authedJson(
      app.baseUrl,
      alex.cookie,
      alex.csrfToken,
      `/api/events/${eventId}`,
    );
    expect(reloaded.body.data?.status).toBe("submitted");
    const fields = reloaded.body.data?.fields as { title?: string } | undefined;
    expect(fields?.title).toBe("Customer planning workshop");
  });

  it("blocks observer writes and cross-tenant reads", async () => {
    const alex = await login(app.baseUrl, "alex@northstar.demo");
    const created = await authedJson(app.baseUrl, alex.cookie, alex.csrfToken, "/api/events", {
      method: "POST",
      body: JSON.stringify({ commandId: "event-create-obs" }),
    });
    const eventId = String(created.body.data?.eventId);

    const observer = await login(app.baseUrl, "observer@northstar.demo");
    const denied = await authedJson(
      app.baseUrl,
      observer.cookie,
      observer.csrfToken,
      `/api/events/${eventId}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          expectedRevision: 1,
          commandId: "event-obs-patch",
          patch: { title: "Nope" },
        }),
      },
    );
    expect(denied.status).toBe(403);

    const casey = await login(app.baseUrl, "casey@cedar.demo");
    const hidden = await authedJson(
      app.baseUrl,
      casey.cookie,
      casey.csrfToken,
      `/api/events/${eventId}`,
    );
    expect(hidden.status).toBe(404);
  });
});
