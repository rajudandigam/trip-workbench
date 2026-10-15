import {
  AIRPORTS,
  CABINS,
  POLICY_VERSION,
  type FieldIssue,
  type ReviewRequirement,
  type TripFields,
  type TripPatch,
  type ValidationResult,
} from "./types.js";
import {
  calendarDateInTimezone,
  calendarDaysBetween,
  compareCalendarDates,
  isValidCalendarDate,
  type Clock,
} from "./clock.js";

export const COMMAND_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export function assertCommandId(commandId: string): void {
  if (!COMMAND_ID_RE.test(commandId)) {
    throw Object.assign(new Error("Invalid commandId"), {
      status: 422,
      code: "INVALID_INPUT",
    });
  }
}

export function mergePatch(base: TripFields, patch: TripPatch): TripFields {
  return { ...base, ...patch };
}

/** Structural checks on a patch against current fields (merged candidate). */
export function validatePatchMerge(
  current: TripFields,
  patch: TripPatch,
): FieldIssue[] {
  if (!patch || Object.keys(patch).length === 0) {
    return [{ field: "general", code: "EMPTY_PATCH", message: "Patch must include at least one field." }];
  }

  const issues: FieldIssue[] = [];
  const allowed: (keyof TripFields)[] = [
    "origin",
    "destination",
    "departureDate",
    "returnDate",
    "tripType",
    "passengerCount",
    "cabin",
    "purpose",
  ];
  for (const key of Object.keys(patch)) {
    if (!allowed.includes(key as keyof TripFields)) {
      issues.push({
        field: "general",
        code: "UNKNOWN_KEY",
        message: `Unknown field: ${key}`,
      });
    }
  }
  if (issues.length) return issues;

  if ("tripType" in patch && patch.tripType == null) {
    issues.push({ field: "tripType", code: "REQUIRED", message: "tripType cannot be null." });
  }
  if ("passengerCount" in patch && patch.passengerCount == null) {
    issues.push({
      field: "passengerCount",
      code: "REQUIRED",
      message: "passengerCount cannot be null.",
    });
  }
  if ("cabin" in patch && patch.cabin == null) {
    issues.push({ field: "cabin", code: "REQUIRED", message: "cabin cannot be null." });
  }
  if ("purpose" in patch && patch.purpose == null) {
    issues.push({ field: "purpose", code: "REQUIRED", message: "purpose cannot be null." });
  }

  if (patch.origin !== undefined && patch.origin !== null && !AIRPORTS.includes(patch.origin as never)) {
    issues.push({ field: "origin", code: "UNKNOWN_AIRPORT", message: "Unknown origin airport." });
  }
  if (
    patch.destination !== undefined &&
    patch.destination !== null &&
    !AIRPORTS.includes(patch.destination as never)
  ) {
    issues.push({
      field: "destination",
      code: "UNKNOWN_AIRPORT",
      message: "Unknown destination airport.",
    });
  }
  if (patch.departureDate !== undefined && patch.departureDate !== null) {
    if (!isValidCalendarDate(patch.departureDate)) {
      issues.push({
        field: "departureDate",
        code: "INVALID_DATE",
        message: "departureDate must be a valid YYYY-MM-DD calendar date.",
      });
    }
  }
  if (patch.returnDate !== undefined && patch.returnDate !== null) {
    if (!isValidCalendarDate(patch.returnDate)) {
      issues.push({
        field: "returnDate",
        code: "INVALID_DATE",
        message: "returnDate must be a valid YYYY-MM-DD calendar date.",
      });
    }
  }
  if (patch.tripType !== undefined && patch.tripType !== "one_way" && patch.tripType !== "round_trip") {
    issues.push({ field: "tripType", code: "INVALID", message: "Invalid tripType." });
  }
  if (patch.cabin !== undefined && patch.cabin !== null && !CABINS.includes(patch.cabin)) {
    issues.push({ field: "cabin", code: "INVALID", message: "Invalid cabin." });
  }
  if (patch.passengerCount !== undefined && patch.passengerCount !== null) {
    if (
      !Number.isInteger(patch.passengerCount) ||
      patch.passengerCount < 1 ||
      patch.passengerCount > 9
    ) {
      issues.push({
        field: "passengerCount",
        code: "INVALID",
        message: "passengerCount must be an integer from 1 to 9.",
      });
    }
  }
  if (patch.purpose !== undefined && patch.purpose !== null && patch.purpose.length > 500) {
    issues.push({
      field: "purpose",
      code: "TOO_LONG",
      message: "purpose must be at most 500 characters.",
    });
  }

  const merged = mergePatch(current, patch);
  if (
    patch.tripType === "one_way" &&
    merged.returnDate !== null &&
    !("returnDate" in patch && patch.returnDate === null)
  ) {
    issues.push({
      field: "returnDate",
      code: "MUST_CLEAR",
      message: "Switching to one_way requires returnDate: null in the same patch.",
    });
  }
  if (merged.origin && merged.destination && merged.origin === merged.destination) {
    issues.push({
      field: "destination",
      code: "SAME_AIRPORT",
      message: "Origin and destination must differ.",
    });
  }
  if (
    merged.departureDate &&
    merged.returnDate &&
    compareCalendarDates(merged.returnDate, merged.departureDate) < 0
  ) {
    issues.push({
      field: "returnDate",
      code: "BEFORE_DEPARTURE",
      message: "Return date cannot precede departure.",
    });
  }

  return issues;
}

export function evaluateCompleteness(
  fields: TripFields,
  clock: Clock,
  timeZone: string,
): FieldIssue[] {
  const issues: FieldIssue[] = [];
  if (!fields.origin) {
    issues.push({ field: "origin", code: "MISSING", message: "Origin is required." });
  }
  if (!fields.destination) {
    issues.push({ field: "destination", code: "MISSING", message: "Destination is required." });
  }
  if (!fields.departureDate) {
    issues.push({
      field: "departureDate",
      code: "MISSING",
      message: "Departure date is required.",
    });
  }
  if (fields.tripType === "round_trip" && !fields.returnDate) {
    issues.push({
      field: "returnDate",
      code: "MISSING",
      message: "Return date is required for round trips.",
    });
  }
  if (fields.tripType === "one_way" && fields.returnDate !== null) {
    issues.push({
      field: "returnDate",
      code: "MUST_BE_NULL",
      message: "One-way trips must have a null return date.",
    });
  }
  if (!fields.purpose.trim()) {
    issues.push({ field: "purpose", code: "MISSING", message: "Purpose is required." });
  }
  if (fields.departureDate) {
    const today = calendarDateInTimezone(clock.now(), timeZone);
    if (compareCalendarDates(fields.departureDate, today) < 0) {
      issues.push({
        field: "departureDate",
        code: "PAST_DEPARTURE",
        message: "Departure cannot be before the reference date.",
      });
    }
  }
  return issues;
}

export function evaluatePolicy(fields: TripFields, clock: Clock, timeZone: string): ReviewRequirement[] {
  const reqs: ReviewRequirement[] = [];
  if (fields.cabin === "premium_economy" || fields.cabin === "business") {
    reqs.push({ code: "PREMIUM_CABIN", message: "Premium cabin requires review." });
  }
  if (fields.departureDate) {
    const today = calendarDateInTimezone(clock.now(), timeZone);
    const days = calendarDaysBetween(today, fields.departureDate);
    if (days >= 0 && days <= 6) {
      reqs.push({
        code: "SHORT_NOTICE",
        message: "Departure within seven calendar days requires review.",
      });
    }
  }
  return reqs;
}

export function validateTripDraft(input: {
  tripId: string;
  revision: number;
  fields: TripFields;
  canMutate: boolean;
  status: "draft" | "submitted";
  clock: Clock;
  timeZone: string;
}): ValidationResult {
  const fieldIssues = evaluateCompleteness(input.fields, input.clock, input.timeZone);
  const reviewRequirements = evaluatePolicy(input.fields, input.clock, input.timeZone);
  const valid = fieldIssues.length === 0;
  const canSubmit = valid && input.canMutate && input.status === "draft";
  return {
    tripId: input.tripId,
    revision: input.revision,
    policyVersion: POLICY_VERSION,
    valid,
    canSubmit,
    fieldIssues,
    reviewRequirements,
  };
}

export function fieldsEqual(a: TripFields, b: TripFields): boolean {
  return (
    a.origin === b.origin &&
    a.destination === b.destination &&
    a.departureDate === b.departureDate &&
    a.returnDate === b.returnDate &&
    a.tripType === b.tripType &&
    a.passengerCount === b.passengerCount &&
    a.cabin === b.cabin &&
    a.purpose === b.purpose
  );
}
