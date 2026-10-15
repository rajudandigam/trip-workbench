import { describe, expect, it } from "vitest";
import { summarizeBriefOnDevice } from "../../src/client/lib/summarizer.js";

describe("summarizer adapter", () => {
  it("reports unavailable when Summarizer global is missing", async () => {
    const result = await summarizeBriefOnDevice("Long travel brief about SFO to JFK.");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("SUMMARIZER_UNAVAILABLE");
    }
  });
});
