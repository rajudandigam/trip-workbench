import { describe, expect, it } from "vitest";
import { mergeAfterInFlightEdit } from "../../src/domain/async-result.js";
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
