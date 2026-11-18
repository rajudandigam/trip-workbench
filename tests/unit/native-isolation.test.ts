import { describe, expect, it } from "vitest";
import {
  classifyNativeStatus,
  isDirtyRefusal,
  isTripDraftGet,
  isTripPatch,
  observeNativeInvoke,
} from "../../scripts/webmcp/native-isolation.js";

describe("native isolation helpers", () => {
  it("classifies native call status separately from envelope", () => {
    expect(classifyNativeStatus("success")).toEqual({
      status: "success",
      raw: "success",
    });
    expect(classifyNativeStatus("error")).toEqual({ status: "error", raw: "error" });
    expect(classifyNativeStatus(undefined).status).toBe("unknown");
  });

  it("records dirty refusal from envelope without inventing native success", () => {
    const obs = observeNativeInvoke(
      "update_trip_draft",
      { status: "success", output: {} },
      { ok: false, error: { code: "USER_EDIT_IN_PROGRESS" } },
    );
    expect(obs.nativeStatus).toBe("success");
    expect(obs.envelopeOk).toBe(false);
    expect(isDirtyRefusal(obs)).toBe(true);
  });

  it("does not treat missing envelope as dirty refusal", () => {
    const obs = observeNativeInvoke("update_trip_draft", { status: "error" }, null);
    expect(isDirtyRefusal(obs)).toBe(false);
  });

  it("matches draft GET and PATCH paths without command receipt URLs", () => {
    const id = "trip-abc";
    expect(isTripDraftGet(`http://localhost:3000/api/trips/${id}`, id, "GET")).toBe(
      true,
    );
    expect(
      isTripDraftGet(`http://localhost:3000/api/trips/${id}/commands/x`, id, "GET"),
    ).toBe(false);
    expect(isTripPatch(`http://localhost:3000/api/trips/${id}`, id, "PATCH")).toBe(
      true,
    );
    expect(isTripPatch(`http://localhost:3000/api/trips/${id}`, id, "GET")).toBe(
      false,
    );
  });
});
