import { describe, expect, it } from "vitest";
import { createProposal } from "../../src/server/adapters/gemini.js";
import type { AppConfig } from "../../src/server/config.js";
import { createClock } from "../../src/domain/clock.js";
import { defaultTripFields } from "../../src/domain/types.js";

function config(mode: AppConfig["aiMode"]): AppConfig {
  return {
    nodeEnv: "test",
    port: 3000,
    apiPort: 3001,
    databaseUrl: "postgresql://example/trip_workbench_test",
    sessionSecret: "x",
    cookieName: "tw",
    clock: createClock("2026-10-14T19:00:00.000Z"),
    allowedDbNamePattern: "trip_workbench",
    seedPassword: "Password123!",
    timeZone: "America/Los_Angeles",
    aiMode: mode,
    geminiApiKey: null,
    geminiModel: "gemini-2.5-flash",
  };
}

describe("gemini fixture adapter", () => {
  it("extracts the SFO-JFK workshop example", async () => {
    const result = await createProposal(config("fixture"), {
      brief:
        "Prepare a round trip from SFO to JFK, departing November 12, 2026 and returning November 15, 2026, for one traveler in economy. Purpose: customer workshop.",
      fields: defaultTripFields(),
      expectedRevision: 1,
      clientEditVersion: 0,
      briefVersion: 1,
      referenceDate: "2026-10-14",
      timeZone: "America/Los_Angeles",
    });
    expect(result.proposal.patch.destination).toBe("JFK");
    expect(result.proposal.clarifications).toHaveLength(0);
  });

  it("asks clarifications for Springfield / next Friday", async () => {
    const result = await createProposal(config("fixture"), {
      brief: "Next Friday to Springfield for a meeting",
      fields: defaultTripFields(),
      expectedRevision: 1,
      clientEditVersion: 0,
      briefVersion: 1,
      referenceDate: "2026-10-14",
      timeZone: "America/Los_Angeles",
    });
    expect(result.proposal.patch).toEqual({});
    expect(result.proposal.clarifications.some((c) => c.kind === "ambiguous")).toBe(true);
  });

  it("fails closed when AI_MODE is disabled", async () => {
    await expect(
      createProposal(config("disabled"), {
        brief: "SFO to JFK",
        fields: defaultTripFields(),
        expectedRevision: 1,
        clientEditVersion: 0,
        briefVersion: 1,
        referenceDate: "2026-10-14",
        timeZone: "America/Los_Angeles",
      }),
    ).rejects.toMatchObject({ code: "AI_DISABLED" });
  });
});
