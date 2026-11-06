import { compareCalendarDates, isValidCalendarDate, type Clock } from "./clock.js";
import {
  EVENT_POLICY_VERSION,
  EVENT_TIME_ZONES,
  type EventFieldIssue,
  type EventFields,
  type EventPatch,
  type EventValidationResult,
} from "./event-types.js";
import { COMMAND_ID_RE } from "./trip-rules.js";

export function assertEventCommandId(commandId: string): void {
  if (!COMMAND_ID_RE.test(commandId)) {
    throw Object.assign(new Error("Invalid commandId"), {
      status: 422,
      code: "INVALID_INPUT",
    });
  }
}

export function mergeEventPatch(base: EventFields, patch: EventPatch): EventFields {
  return { ...base, ...patch };
}

export function eventFieldsEqual(a: EventFields, b: EventFields): boolean {
  return (Object.keys(a) as Array<keyof EventFields>).every((key) => a[key] === b[key]);
}

export function validateEventPatchMerge(
  _current: EventFields,
  patch: EventPatch,
): EventFieldIssue[] {
  if (!patch || Object.keys(patch).length === 0) {
    return [{ field: "general", code: "EMPTY_PATCH", message: "Patch must include at least one field." }];
  }
  const allowed: Array<keyof EventFields> = [
    "title",
    "startDate",
    "endDate",
    "timeZone",
    "locationMode",
    "locationLabel",
    "notes",
  ];
  const issues: EventFieldIssue[] = [];
  for (const key of Object.keys(patch)) {
    if (!allowed.includes(key as keyof EventFields)) {
      issues.push({ field: "general", code: "UNKNOWN_KEY", message: `Unknown field: ${key}` });
    }
  }
  if ("title" in patch && patch.title == null) {
    issues.push({ field: "title", code: "REQUIRED", message: "title cannot be null." });
  }
  if ("timeZone" in patch && patch.timeZone == null) {
    issues.push({ field: "timeZone", code: "REQUIRED", message: "timeZone cannot be null." });
  }
  if ("locationMode" in patch && patch.locationMode == null) {
    issues.push({
      field: "locationMode",
      code: "REQUIRED",
      message: "locationMode cannot be null.",
    });
  }
  if ("locationLabel" in patch && patch.locationLabel == null) {
    issues.push({
      field: "locationLabel",
      code: "REQUIRED",
      message: "locationLabel cannot be null.",
    });
  }
  if ("notes" in patch && patch.notes == null) {
    issues.push({ field: "notes", code: "REQUIRED", message: "notes cannot be null." });
  }
  if (patch.timeZone && !EVENT_TIME_ZONES.includes(patch.timeZone as (typeof EVENT_TIME_ZONES)[number])) {
    issues.push({ field: "timeZone", code: "INVALID", message: "timeZone is not in the allowlist." });
  }
  if (patch.startDate != null && !isValidCalendarDate(patch.startDate)) {
    issues.push({ field: "startDate", code: "INVALID_DATE", message: "startDate must be a real calendar date." });
  }
  if (patch.endDate != null && !isValidCalendarDate(patch.endDate)) {
    issues.push({ field: "endDate", code: "INVALID_DATE", message: "endDate must be a real calendar date." });
  }
  return issues;
}

export function validateEventDraft(input: {
  eventId: string;
  revision: number;
  fields: EventFields;
  status: "draft" | "submitted";
  clock: Clock;
}): EventValidationResult {
  const fieldIssues: EventFieldIssue[] = [];
  const { fields } = input;

  if (!fields.title.trim()) {
    fieldIssues.push({ field: "title", code: "REQUIRED", message: "Title is required." });
  }
  if (!fields.startDate) {
    fieldIssues.push({ field: "startDate", code: "REQUIRED", message: "Start date is required." });
  } else if (!isValidCalendarDate(fields.startDate)) {
    fieldIssues.push({ field: "startDate", code: "INVALID_DATE", message: "Start date is invalid." });
  }
  if (!fields.endDate) {
    fieldIssues.push({ field: "endDate", code: "REQUIRED", message: "End date is required." });
  } else if (!isValidCalendarDate(fields.endDate)) {
    fieldIssues.push({ field: "endDate", code: "INVALID_DATE", message: "End date is invalid." });
  }
  if (
    fields.startDate &&
    fields.endDate &&
    isValidCalendarDate(fields.startDate) &&
    isValidCalendarDate(fields.endDate) &&
    compareCalendarDates(fields.endDate, fields.startDate) < 0
  ) {
    fieldIssues.push({
      field: "endDate",
      code: "DATE_ORDER",
      message: "End date must be on or after the start date.",
    });
  }
  if (!EVENT_TIME_ZONES.includes(fields.timeZone as (typeof EVENT_TIME_ZONES)[number])) {
    fieldIssues.push({ field: "timeZone", code: "INVALID", message: "Choose a supported time zone." });
  }
  if (!fields.locationLabel.trim()) {
    fieldIssues.push({
      field: "locationLabel",
      code: "REQUIRED",
      message: "Location is required.",
    });
  }

  const reviewRequirements: Array<{ code: string; message: string }> = [];
  if (
    fields.startDate &&
    fields.endDate &&
    isValidCalendarDate(fields.startDate) &&
    isValidCalendarDate(fields.endDate)
  ) {
    const span =
      (Date.parse(`${fields.endDate}T00:00:00Z`) - Date.parse(`${fields.startDate}T00:00:00Z`)) /
      86_400_000;
    if (span >= 5) {
      reviewRequirements.push({
        code: "LONG_EVENT",
        message: "Events spanning five or more days require review.",
      });
    }
  }
  if (fields.locationMode === "manual") {
    reviewRequirements.push({
      code: "MANUAL_LOCATION",
      message: "Manual locations require review before recording.",
    });
  }

  const valid = fieldIssues.length === 0;
  return {
    eventId: input.eventId,
    revision: input.revision,
    policyVersion: EVENT_POLICY_VERSION,
    valid,
    canSubmit: valid && input.status === "draft",
    fieldIssues,
    reviewRequirements,
  };
}
