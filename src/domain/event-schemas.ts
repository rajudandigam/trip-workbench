import { z } from "zod";
import { isValidCalendarDate } from "./clock.js";
import { EVENT_TIME_ZONES, type EventPatch } from "./event-types.js";
import { CommandIdSchema, ExpectedRevisionSchema, zodIssuesToFieldIssues } from "./trip-schemas.js";

const calendarDateNullable = z.union([
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")
    .refine(isValidCalendarDate, "Date must be a real calendar date"),
  z.null(),
]);

export const EventPatchSchema = z
  .object({
    title: z.string().max(200).optional(),
    startDate: calendarDateNullable.optional(),
    endDate: calendarDateNullable.optional(),
    timeZone: z.enum(EVENT_TIME_ZONES as unknown as [string, ...string[]]).optional(),
    locationMode: z.enum(["synthetic", "manual"]).optional(),
    locationLabel: z.string().max(300).optional(),
    notes: z.string().max(2000).optional(),
  })
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: "Patch must include at least one field.",
  });

export function parseEventPatch(input: unknown):
  | { ok: true; data: EventPatch }
  | {
      ok: false;
      code: "INVALID_INPUT";
      message: string;
      fieldIssues: Array<{ field: string; code: string; message: string }>;
    } {
  const parsed = EventPatchSchema.safeParse(input);
  if (parsed.success) return { ok: true, data: parsed.data as EventPatch };
  return {
    ok: false,
    code: "INVALID_INPUT",
    message: "Patch failed schema validation.",
    fieldIssues: zodIssuesToFieldIssues(parsed.error),
  };
}

export const HttpEventPatchBodySchema = z
  .object({
    expectedRevision: ExpectedRevisionSchema,
    commandId: CommandIdSchema,
    patch: EventPatchSchema,
  })
  .strict();

export function createGetEventDraftArgsSchema(activeEventId: string) {
  return z.object({ eventId: z.literal(activeEventId) }).strict();
}

export function createValidateEventDraftArgsSchema(activeEventId: string) {
  return z
    .object({
      eventId: z.literal(activeEventId),
      expectedRevision: ExpectedRevisionSchema,
    })
    .strict();
}

export function createUpdateEventDraftArgsSchema(activeEventId: string) {
  return z
    .object({
      eventId: z.literal(activeEventId),
      expectedRevision: ExpectedRevisionSchema,
      commandId: CommandIdSchema,
      patch: EventPatchSchema,
    })
    .strict();
}

export function createPrepareEventReviewArgsSchema(activeEventId: string) {
  return z
    .object({
      eventId: z.literal(activeEventId),
      expectedRevision: ExpectedRevisionSchema,
    })
    .strict();
}

export function getEventDraftJsonSchema(activeEventId: string): Record<string, unknown> {
  return z.toJSONSchema(createGetEventDraftArgsSchema(activeEventId)) as Record<string, unknown>;
}

export function updateEventDraftJsonSchema(activeEventId: string): Record<string, unknown> {
  return z.toJSONSchema(createUpdateEventDraftArgsSchema(activeEventId)) as Record<
    string,
    unknown
  >;
}

export function validateEventDraftJsonSchema(activeEventId: string): Record<string, unknown> {
  return z.toJSONSchema(createValidateEventDraftArgsSchema(activeEventId)) as Record<
    string,
    unknown
  >;
}

export function prepareEventReviewJsonSchema(activeEventId: string): Record<string, unknown> {
  return z.toJSONSchema(createPrepareEventReviewArgsSchema(activeEventId)) as Record<
    string,
    unknown
  >;
}

export { CommandIdSchema, ExpectedRevisionSchema };
