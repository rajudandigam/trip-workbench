import { describe, expect, it } from "vitest";
import { createClock } from "../../src/domain/clock.js";
import { defaultTripFields } from "../../src/domain/types.js";
import { validatePatchMerge, validateTripDraft } from "../../src/domain/trip-rules.js";

const clock = createClock("2026-10-14T19:00:00.000Z");

describe("trip rules", () => {
  it("rejects same airports and return before departure", () => {
    const current = defaultTripFields();
    expect(
      validatePatchMerge(current, { destination: "SFO" }).some((i) => i.code === "SAME_AIRPORT"),
    ).toBe(true);
    expect(
      validatePatchMerge(current, {
        destination: "JFK",
        departureDate: "2026-11-15",
        returnDate: "2026-11-12",
      }).some((i) => i.code === "BEFORE_DEPARTURE"),
    ).toBe(true);
  });

  it("requires clearing returnDate when switching to one_way", () => {
    const current = {
      ...defaultTripFields(),
      destination: "JFK",
      departureDate: "2026-11-12",
      returnDate: "2026-11-15",
    };
    const issues = validatePatchMerge(current, { tripType: "one_way" });
    expect(issues.some((i) => i.code === "MUST_CLEAR")).toBe(true);
  });

  it("marks complete SFO-JFK workshop draft submittable with no review", () => {
    const result = validateTripDraft({
      tripId: "t1",
      revision: 2,
      fields: {
        origin: "SFO",
        destination: "JFK",
        departureDate: "2026-11-12",
        returnDate: "2026-11-15",
        tripType: "round_trip",
        passengerCount: 1,
        cabin: "economy",
        purpose: "customer workshop",
      },
      canMutate: true,
      status: "draft",
      clock,
      timeZone: "America/Los_Angeles",
    });
    expect(result.valid).toBe(true);
    expect(result.canSubmit).toBe(true);
    expect(result.reviewRequirements).toHaveLength(0);
  });

  it("adds PREMIUM_CABIN review requirement", () => {
    const result = validateTripDraft({
      tripId: "t1",
      revision: 2,
      fields: {
        origin: "SFO",
        destination: "JFK",
        departureDate: "2026-11-12",
        returnDate: "2026-11-15",
        tripType: "round_trip",
        passengerCount: 1,
        cabin: "business",
        purpose: "customer workshop",
      },
      canMutate: true,
      status: "draft",
      clock,
      timeZone: "America/Los_Angeles",
    });
    expect(result.valid).toBe(true);
    expect(result.canSubmit).toBe(true);
    expect(result.reviewRequirements.some((r) => r.code === "PREMIUM_CABIN")).toBe(true);
  });
});
