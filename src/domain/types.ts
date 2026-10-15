export type TripType = "one_way" | "round_trip";
export type Cabin = "economy" | "premium_economy" | "business";
export type TripStatus = "draft" | "submitted";
export type UserRole = "traveler" | "observer";

export type TripFields = {
  origin: string | null;
  destination: string | null;
  departureDate: string | null;
  returnDate: string | null;
  tripType: TripType;
  passengerCount: number;
  cabin: Cabin;
  purpose: string;
};

export type TripPatch = Partial<TripFields>;

export type TripView = {
  id: string;
  revision: number;
  status: TripStatus;
  fields: TripFields;
  createdAt: string;
  updatedAt: string;
  submittedAt?: string | null;
  reviewRequirements?: ReviewRequirement[];
  policyVersion?: string | null;
};

export type FieldIssue = {
  field: keyof TripFields | "general";
  code: string;
  message: string;
};

export type ReviewRequirement = {
  code: string;
  message: string;
};

export type ValidationResult = {
  tripId: string;
  revision: number;
  policyVersion: string;
  valid: boolean;
  canSubmit: boolean;
  fieldIssues: FieldIssue[];
  reviewRequirements: ReviewRequirement[];
};

export type CommandOutcome = "applied" | "no_change" | "rejected" | "conflict";

export type CommandReceipt = {
  commandId: string;
  outcome: CommandOutcome;
  tripId: string;
  fromRevision: number | null;
  toRevision: number | null;
  fields?: TripFields;
  status?: TripStatus;
  action: string;
};

export const AIRPORTS = ["SFO", "SJC", "OAK", "JFK", "EWR", "BOS", "LAX", "ORD", "SEA"] as const;
export type AirportCode = (typeof AIRPORTS)[number];

export const CABINS: Cabin[] = ["economy", "premium_economy", "business"];
export const POLICY_VERSION = "demo-policy-v1";

export function defaultTripFields(): TripFields {
  return {
    origin: "SFO",
    destination: null,
    departureDate: null,
    returnDate: null,
    tripType: "round_trip",
    passengerCount: 1,
    cabin: "economy",
    purpose: "",
  };
}
