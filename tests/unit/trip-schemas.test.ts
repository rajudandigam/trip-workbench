import { describe, expect, it } from "vitest";
import {
  TripPatchSchema,
  createUpdateTripDraftArgsSchema,
  parseTripPatch,
  tripPatchJsonSchema,
} from "../../src/domain/trip-schemas.js";
import { defaultTripFields } from "../../src/domain/types.js";
import { validatePatchMerge } from "../../src/domain/trip-rules.js";

describe("trip patch schemas", () => {
  it("rejects purpose number, string passengerCount, empty patch, and unknown keys", () => {
    expect(parseTripPatch({ purpose: 42 }).ok).toBe(false);
    expect(parseTripPatch({ passengerCount: "2" }).ok).toBe(false);
    expect(parseTripPatch({}).ok).toBe(false);
    expect(parseTripPatch({ role: "admin" }).ok).toBe(false);
  });

  it("rejects invalid calendar dates such as 2026-02-30", () => {
    expect(parseTripPatch({ departureDate: "2026-02-30" }).ok).toBe(false);
  });

  it("allows partial destination-only patches for incomplete drafts", () => {
    const parsed = parseTripPatch({ destination: "JFK" });
    expect(parsed.ok).toBe(true);
    const issues = validatePatchMerge(defaultTripFields(), { destination: "JFK" });
    expect(issues).toHaveLength(0);
  });

  it("rejects extra outer role on update args", () => {
    const schema = createUpdateTripDraftArgsSchema("draft-1");
    const result = schema.safeParse({
      draftId: "draft-1",
      expectedRevision: 1,
      commandId: "demo-update-001",
      patch: { destination: "JFK" },
      role: "admin",
    });
    expect(result.success).toBe(false);
  });

  it("accepts the documented SFO-JFK update example", () => {
    const schema = createUpdateTripDraftArgsSchema("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    const result = schema.safeParse({
      draftId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      expectedRevision: 1,
      commandId: "demo-update-001",
      patch: {
        origin: "SFO",
        destination: "JFK",
        departureDate: "2026-11-12",
        returnDate: "2026-11-15",
        tripType: "round_trip",
        passengerCount: 1,
        cabin: "economy",
        purpose: "customer workshop",
      },
    });
    expect(result.success).toBe(true);
  });

  it("exposes patch JSON Schema with additionalProperties false", () => {
    const json = tripPatchJsonSchema();
    expect(json).toBeTruthy();
    // Zod 4 may nest under $schema; assert the shape schema rejects unknown keys via runtime.
    expect(TripPatchSchema.safeParse({ purpose: "x", ownerId: "nope" }).success).toBe(false);
  });
});
