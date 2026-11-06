export type EventStatus = "draft" | "submitted";
export type EventLocationMode = "synthetic" | "manual";

export type EventFields = {
  title: string;
  startDate: string | null;
  endDate: string | null;
  timeZone: string;
  locationMode: EventLocationMode;
  locationLabel: string;
  notes: string;
};

export type EventPatch = Partial<EventFields>;

export type EventView = {
  id: string;
  revision: number;
  status: EventStatus;
  fields: EventFields;
  createdAt: string;
  updatedAt: string;
  submittedAt?: string | null;
  reviewRequirements?: Array<{ code: string; message: string }>;
  policyVersion?: string | null;
};

export type EventFieldIssue = {
  field: keyof EventFields | "general";
  code: string;
  message: string;
};

export type EventValidationResult = {
  eventId: string;
  revision: number;
  policyVersion: string;
  valid: boolean;
  canSubmit: boolean;
  fieldIssues: EventFieldIssue[];
  reviewRequirements: Array<{ code: string; message: string }>;
};

export type EventCommandReceipt = {
  commandId: string;
  outcome: "applied" | "no_change" | "rejected" | "conflict";
  eventId: string;
  fromRevision: number | null;
  toRevision: number | null;
  fields?: EventFields;
  status?: EventStatus;
  action: string;
};

export const EVENT_TIME_ZONES = [
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "UTC",
] as const;

export const SYNTHETIC_VENUES = [
  "Northstar Demo Campus — Atrium",
  "Cedar Demo Hub — Room 12",
  "Virtual — Demo Bridge",
] as const;

export const EVENT_POLICY_VERSION = "demo-event-policy-v1";

export function defaultEventFields(): EventFields {
  return {
    title: "",
    startDate: null,
    endDate: null,
    timeZone: "America/Los_Angeles",
    locationMode: "synthetic",
    locationLabel: "",
    notes: "",
  };
}
