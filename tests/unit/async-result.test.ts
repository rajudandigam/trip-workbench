import { describe, expect, it } from "vitest";
import { mergeAfterInFlightEdit, mergeAfterRefresh } from "../../src/domain/async-result.js";
import { defaultTripFields } from "../../src/domain/types.js";

describe("mergeAfterInFlightEdit", () => {
  it("keeps human purpose while accepting agent destination", () => {
    const savedAtDispatch = { ...defaultTripFields(), purpose: "Workshop", destination: null };
    const localAtDispatch = { ...savedAtDispatch };
    const localNow = { ...savedAtDispatch, purpose: "Leadership meeting" };
    const serverFields = { ...savedAtDispatch, destination: "JFK", purpose: "Workshop" };
    const merged = mergeAfterInFlightEdit({
      savedAtDispatch,
      localAtDispatch,
      localNow,
      serverFields,
    });
    expect(merged.localFields.destination).toBe("JFK");
    expect(merged.localFields.purpose).toBe("Leadership meeting");
    expect(merged.dirty).toBe(true);
    expect(merged.overlapped).toEqual([]);
  });

  it("marks overlap when the same field was changed by both", () => {
    const savedAtDispatch = { ...defaultTripFields(), purpose: "A" };
    const localAtDispatch = { ...savedAtDispatch };
    const localNow = { ...savedAtDispatch, purpose: "Human" };
    const serverFields = { ...savedAtDispatch, purpose: "Agent" };
    const merged = mergeAfterInFlightEdit({
      savedAtDispatch,
      localAtDispatch,
      localNow,
      serverFields,
    });
    expect(merged.localFields.purpose).toBe("Human");
    expect(merged.overlapped).toContain("purpose");
  });
});

describe("mergeAfterRefresh", () => {
  it("preserves dirty fields that existed before the read started", () => {
    const savedAtDispatch = { ...defaultTripFields(), purpose: "Workshop", destination: "JFK" };
    const localAtDispatch = { ...savedAtDispatch, purpose: "Customer planning workshop" };
    const localNow = { ...localAtDispatch };
    const serverFields = { ...savedAtDispatch, destination: "BOS" };
    const merged = mergeAfterRefresh({
      savedAtDispatch,
      localAtDispatch,
      localNow,
      serverFields,
    });
    expect(merged.localFields.purpose).toBe("Customer planning workshop");
    expect(merged.localFields.destination).toBe("BOS");
    expect(merged.dirty).toBe(true);
  });

  it("also preserves edits made while the read is in flight", () => {
    const savedAtDispatch = { ...defaultTripFields(), purpose: "Workshop", cabin: "economy" as const };
    const localAtDispatch = { ...savedAtDispatch, purpose: "Dirty before" };
    const localNow = { ...localAtDispatch, cabin: "business" as const };
    const serverFields = { ...savedAtDispatch, destination: "JFK" as const };
    const merged = mergeAfterRefresh({
      savedAtDispatch,
      localAtDispatch,
      localNow,
      serverFields,
    });
    expect(merged.localFields.purpose).toBe("Dirty before");
    expect(merged.localFields.cabin).toBe("business");
    expect(merged.localFields.destination).toBe("JFK");
    expect(merged.dirty).toBe(true);
  });

  it("marks overlap when a dirty local field also changed on the server", () => {
    const savedAtDispatch = { ...defaultTripFields(), purpose: "A" };
    const localAtDispatch = { ...savedAtDispatch, purpose: "Human" };
    const localNow = { ...localAtDispatch };
    const serverFields = { ...savedAtDispatch, purpose: "Elsewhere" };
    const merged = mergeAfterRefresh({
      savedAtDispatch,
      localAtDispatch,
      localNow,
      serverFields,
    });
    expect(merged.localFields.purpose).toBe("Human");
    expect(merged.overlapped).toContain("purpose");
  });
});
