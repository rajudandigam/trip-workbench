import { describe, expect, it } from "vitest";
import { validateEventDraft, validateEventPatchMerge } from "../../src/domain/event-rules.js";
import { defaultEventFields } from "../../src/domain/event-types.js";

const clock = { now: () => new Date("2026-11-06T19:00:00.000Z") };

describe("event rules", () => {
  it("requires title, dates, and location", () => {
    const result = validateEventDraft({
      eventId: "e1",
      revision: 1,
      fields: defaultEventFields(),
      status: "draft",
      clock,
    });
    expect(result.valid).toBe(false);
    expect(result.canSubmit).toBe(false);
    expect(result.fieldIssues.map((i) => i.field)).toEqual(
      expect.arrayContaining(["title", "startDate", "endDate", "locationLabel"]),
    );
  });

  it("flags long events and manual locations as review requirements", () => {
    const result = validateEventDraft({
      eventId: "e1",
      revision: 1,
      fields: {
        title: "Planning workshop",
        startDate: "2026-12-01",
        endDate: "2026-12-07",
        timeZone: "America/Los_Angeles",
        locationMode: "manual",
        locationLabel: "Customer HQ",
        notes: "",
      },
      status: "draft",
      clock,
    });
    expect(result.valid).toBe(true);
    expect(result.canSubmit).toBe(true);
    expect(result.reviewRequirements.map((r) => r.code)).toEqual(
      expect.arrayContaining(["LONG_EVENT", "MANUAL_LOCATION"]),
    );
  });

  it("rejects empty patches", () => {
    const issues = validateEventPatchMerge(defaultEventFields(), {});
    expect(issues[0]?.code).toBe("EMPTY_PATCH");
  });
});
