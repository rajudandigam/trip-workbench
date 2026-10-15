import { z } from "zod";
import type { AiMode, AppConfig } from "../config.js";
import type { TripFields, TripPatch } from "../../domain/types.js";
import { AIRPORTS, CABINS } from "../../domain/types.js";
import { isValidCalendarDate } from "../../domain/clock.js";
import { mergePatch, validatePatchMerge } from "../../domain/trip-rules.js";

const ClarificationSchema = z.object({
  field: z
    .enum([
      "origin",
      "destination",
      "departureDate",
      "returnDate",
      "tripType",
      "passengerCount",
      "cabin",
      "purpose",
    ])
    .nullable(),
  kind: z.enum(["missing", "ambiguous", "unsupported"]),
  question: z.string().max(240),
});

const ProposedTripSchema = z.object({
  patch: z
    .object({
      origin: z.string().nullable().optional(),
      destination: z.string().nullable().optional(),
      departureDate: z.string().nullable().optional(),
      returnDate: z.string().nullable().optional(),
      tripType: z.enum(["one_way", "round_trip"]).optional(),
      passengerCount: z.number().int().min(1).max(9).optional(),
      cabin: z.enum(["economy", "premium_economy", "business"]).optional(),
      purpose: z.string().max(500).optional(),
    })
    .strict(),
  clarifications: z.array(ClarificationSchema).max(8),
});

export type ProposedTrip = z.infer<typeof ProposedTripSchema>;

export type ProposalResult = {
  proposal: ProposedTrip;
  mode: AiMode;
  model: string | null;
  boundRevision: number;
  boundClientEditVersion: number;
  boundBriefVersion: number;
};

export type ProposalInput = {
  brief: string;
  fields: TripFields;
  expectedRevision: number;
  clientEditVersion: number;
  briefVersion: number;
  referenceDate: string;
  timeZone: string;
};

function fixtureProposal(brief: string): ProposedTrip {
  const lower = brief.toLowerCase();
  if (lower.includes("springfield") || lower.includes("next friday")) {
    return {
      patch: {},
      clarifications: [
        {
          field: "destination",
          kind: "ambiguous",
          question: "Which airport should we use for Springfield?",
        },
        {
          field: "departureDate",
          kind: "ambiguous",
          question: "Which exact calendar date is next Friday for this trip?",
        },
      ],
    };
  }
  if (lower.includes("purchase") || lower.includes("buy ticket") || lower.includes("credit card")) {
    return {
      patch: {},
      clarifications: [
        {
          field: null,
          kind: "unsupported",
          question: "Trip Workbench submits a request only; ticket purchase is not supported.",
        },
      ],
    };
  }
  // Exact SFO-JFK workshop example and similar complete briefs
  if (lower.includes("sfo") && lower.includes("jfk")) {
    return {
      patch: {
        origin: "SFO",
        destination: "JFK",
        departureDate: "2026-11-12",
        returnDate: "2026-11-15",
        tripType: "round_trip",
        passengerCount: 1,
        cabin: "economy",
        purpose: "customer workshop",
      },
      clarifications: [],
    };
  }
  return {
    patch: {},
    clarifications: [
      {
        field: "destination",
        kind: "missing",
        question: "What is the destination airport code?",
      },
    ],
  };
}

function sanitizeProposal(raw: ProposedTrip, current: TripFields): ProposedTrip {
  const patch: TripPatch = { ...raw.patch };
  for (const key of Object.keys(patch) as (keyof TripPatch)[]) {
    const value = patch[key];
    if (key === "origin" || key === "destination") {
      if (value != null && !AIRPORTS.includes(value as never)) {
        throw Object.assign(new Error("Model proposed unknown airport"), {
          status: 502,
          code: "AI_INVALID_OUTPUT",
        });
      }
    }
    if ((key === "departureDate" || key === "returnDate") && value != null) {
      if (!isValidCalendarDate(String(value))) {
        throw Object.assign(new Error("Model proposed invalid date"), {
          status: 502,
          code: "AI_INVALID_OUTPUT",
        });
      }
    }
    if (key === "cabin" && value != null && !CABINS.includes(value as never)) {
      throw Object.assign(new Error("Model proposed invalid cabin"), {
        status: 502,
        code: "AI_INVALID_OUTPUT",
      });
    }
  }
  // Reject protected keys — schema.strict already rejects unknown keys
  if (Object.keys(patch).length) {
    const issues = validatePatchMerge(current, patch);
    if (issues.length) {
      throw Object.assign(new Error("Model proposal failed domain checks"), {
        status: 502,
        code: "AI_INVALID_OUTPUT",
        fieldIssues: issues,
      });
    }
    // Ensure merge stays coherent
    mergePatch(current, patch);
  }
  return { patch, clarifications: raw.clarifications };
}

async function liveProposal(config: AppConfig, input: ProposalInput): Promise<ProposedTrip> {
  if (!config.geminiApiKey) {
    throw Object.assign(new Error("Gemini is not configured"), {
      status: 503,
      code: "AI_UNAVAILABLE",
    });
  }
  const { GoogleGenAI } = await import("@google/genai");
  const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });
  const prompt = [
    "Extract a business trip draft patch from the brief.",
    `Reference date: ${input.referenceDate} (${input.timeZone}).`,
    `Allowed airports: ${AIRPORTS.join(", ")}.`,
    `Allowed cabins: ${CABINS.join(", ")}.`,
    "Return JSON only with shape {patch, clarifications}.",
    "Do not invent airports or purchase tickets. Ask clarification when ambiguous.",
    `Current fields: ${JSON.stringify(input.fields)}`,
    `Brief: ${input.brief}`,
  ].join("\n");

  const response = await ai.models.generateContent({
    model: config.geminiModel,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
    },
  });

  const text = response.text;
  if (!text) {
    throw Object.assign(new Error("Empty Gemini response"), {
      status: 502,
      code: "AI_INVALID_OUTPUT",
    });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw Object.assign(new Error("Gemini returned non-JSON"), {
      status: 502,
      code: "AI_INVALID_OUTPUT",
    });
  }
  const checked = ProposedTripSchema.safeParse(parsed);
  if (!checked.success) {
    throw Object.assign(new Error("Gemini JSON failed schema"), {
      status: 502,
      code: "AI_INVALID_OUTPUT",
    });
  }
  return checked.data;
}

export async function createProposal(
  config: AppConfig,
  input: ProposalInput,
): Promise<ProposalResult> {
  if (input.brief.length > 4000) {
    throw Object.assign(new Error("Brief too long"), { status: 422, code: "INVALID_INPUT" });
  }
  if (config.aiMode === "disabled") {
    throw Object.assign(new Error("Gemini assistance is disabled"), {
      status: 503,
      code: "AI_DISABLED",
    });
  }

  let raw: ProposedTrip;
  if (config.aiMode === "fixture") {
    raw = fixtureProposal(input.brief);
  } else {
    try {
      raw = await liveProposal(config, input);
    } catch (error) {
      const err = error as { code?: string; status?: number };
      if (err.code) throw error;
      throw Object.assign(new Error("Gemini request failed"), {
        status: 504,
        code: "AI_TIMEOUT",
      });
    }
  }

  const proposal = sanitizeProposal(raw, input.fields);
  return {
    proposal,
    mode: config.aiMode,
    model: config.aiMode === "live" ? config.geminiModel : config.aiMode === "fixture" ? "fixture" : null,
    boundRevision: input.expectedRevision,
    boundClientEditVersion: input.clientEditVersion,
    boundBriefVersion: input.briefVersion,
  };
}
