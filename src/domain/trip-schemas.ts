import { z } from "zod";
import { AIRPORTS, type TripPatch } from "./types.js";
import { isValidCalendarDate } from "./clock.js";
import { COMMAND_ID_RE } from "./trip-rules.js";

const airportNullable = z.union([z.enum(AIRPORTS as unknown as [string, ...string[]]), z.null()]);
const calendarDateNullable = z.union([
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")
    .refine(isValidCalendarDate, "Date must be a real calendar date"),
  z.null(),
]);

/** Mutation patch: every field optional; unknown keys rejected; null only for airports/dates. */
export const TripPatchSchema = z
  .object({
    origin: airportNullable.optional(),
    destination: airportNullable.optional(),
    departureDate: calendarDateNullable.optional(),
    returnDate: calendarDateNullable.optional(),
    tripType: z.enum(["one_way", "round_trip"]).optional(),
    passengerCount: z.number().int().min(1).max(9).optional(),
    cabin: z.enum(["economy", "premium_economy", "business"]).optional(),
    purpose: z.string().max(500).optional(),
  })
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: "Patch must include at least one field.",
  });

export const CommandIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(COMMAND_ID_RE, "Invalid commandId format");

export const ExpectedRevisionSchema = z.number().int().positive();

export function createGetTripDraftArgsSchema(activeDraftId: string) {
  return z
    .object({
      draftId: z.literal(activeDraftId),
    })
    .strict();
}

export function createValidateTripDraftArgsSchema(activeDraftId: string) {
  return z
    .object({
      draftId: z.literal(activeDraftId),
      expectedRevision: ExpectedRevisionSchema,
    })
    .strict();
}

export function createUpdateTripDraftArgsSchema(activeDraftId: string) {
  return z
    .object({
      draftId: z.literal(activeDraftId),
      expectedRevision: ExpectedRevisionSchema,
      commandId: CommandIdSchema,
      patch: TripPatchSchema,
    })
    .strict();
}

/** HTTP PATCH body (draft id comes from the path). */
export const HttpTripPatchBodySchema = z
  .object({
    expectedRevision: ExpectedRevisionSchema,
    commandId: CommandIdSchema,
    patch: TripPatchSchema,
  })
  .strict();

export type ParsedTripPatch = z.infer<typeof TripPatchSchema>;

export function parseTripPatch(input: unknown): {
  ok: true;
  data: TripPatch;
} | {
  ok: false;
  code: "INVALID_INPUT";
  message: string;
  fieldIssues: Array<{ field: string; code: string; message: string }>;
} {
  const parsed = TripPatchSchema.safeParse(input);
  if (parsed.success) {
    return { ok: true, data: parsed.data as TripPatch };
  }
  return {
    ok: false,
    code: "INVALID_INPUT",
    message: "Patch failed schema validation.",
    fieldIssues: zodIssuesToFieldIssues(parsed.error),
  };
}

export function zodIssuesToFieldIssues(
  error: z.ZodError,
): Array<{ field: string; code: string; message: string }> {
  return error.issues.map((issue) => ({
    field: issue.path.length ? String(issue.path[0]) : "general",
    code: "INVALID_INPUT",
    message: issue.message,
  }));
}

export function zodErrorToHttp(error: z.ZodError) {
  return Object.assign(new Error("Request failed validation."), {
    status: 422,
    code: "INVALID_INPUT",
    fieldIssues: zodIssuesToFieldIssues(error),
  });
}

/** JSON Schema for native WebMCP registration (derived from Zod). */
export function tripPatchJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(TripPatchSchema) as Record<string, unknown>;
}

export function updateTripDraftJsonSchema(activeDraftId: string): Record<string, unknown> {
  return z.toJSONSchema(createUpdateTripDraftArgsSchema(activeDraftId)) as Record<string, unknown>;
}

export function validateTripDraftJsonSchema(activeDraftId: string): Record<string, unknown> {
  return z.toJSONSchema(createValidateTripDraftArgsSchema(activeDraftId)) as Record<
    string,
    unknown
  >;
}

export function getTripDraftJsonSchema(activeDraftId: string): Record<string, unknown> {
  return z.toJSONSchema(createGetTripDraftArgsSchema(activeDraftId)) as Record<string, unknown>;
}
