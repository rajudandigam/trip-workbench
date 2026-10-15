import crypto from "node:crypto";
import type { Db, DbClient } from "../db/pool.js";
import { withTransaction } from "../db/pool.js";
import type { Clock } from "../../domain/clock.js";
import {
  defaultTripFields,
  POLICY_VERSION,
  type CommandReceipt,
  type TripFields,
  type TripPatch,
  type TripStatus,
  type TripView,
  type ValidationResult,
} from "../../domain/types.js";
import {
  assertCommandId,
  fieldsEqual,
  mergePatch,
  validatePatchMerge,
  validateTripDraft,
} from "../../domain/trip-rules.js";
import { parseTripPatch } from "../../domain/trip-schemas.js";
import type { SessionActor } from "./session-service.js";

type TripRow = {
  id: string;
  tenant_id: string;
  owner_id: string;
  revision: number;
  status: TripStatus;
  origin: string | null;
  destination: string | null;
  departure_date: string | null;
  return_date: string | null;
  trip_type: TripFields["tripType"];
  passenger_count: number;
  cabin: TripFields["cabin"];
  purpose: string;
  created_at: Date | string;
  updated_at: Date | string;
};

function dateOnly(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const s = String(value);
  return s.slice(0, 10);
}

function mapFields(row: TripRow): TripFields {
  return {
    origin: row.origin,
    destination: row.destination,
    departureDate: dateOnly(row.departure_date),
    returnDate: dateOnly(row.return_date),
    tripType: row.trip_type,
    passengerCount: Number(row.passenger_count),
    cabin: row.cabin,
    purpose: row.purpose,
  };
}

function mapTrip(row: TripRow, extras: Partial<TripView> = {}): TripView {
  return {
    id: row.id,
    revision: row.revision,
    status: row.status,
    fields: mapFields(row),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    ...extras,
  };
}

function canonicalHash(parts: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

function httpError(status: number, code: string, message: string, extra: Record<string, unknown> = {}) {
  return Object.assign(new Error(message), { status, code, ...extra });
}

export class TripService {
  constructor(
    private readonly db: Db,
    private readonly clock: Clock,
    private readonly timeZone: string,
  ) {}

  private canRead(actor: SessionActor, row: TripRow): boolean {
    if (actor.tenantId !== row.tenant_id) return false;
    if (actor.role === "observer") return true;
    return actor.userId === row.owner_id;
  }

  private canMutate(actor: SessionActor, row: TripRow): boolean {
    return (
      actor.tenantId === row.tenant_id &&
      actor.role === "traveler" &&
      actor.userId === row.owner_id
    );
  }

  private async loadAuthorized(
    client: Db | DbClient,
    actor: SessionActor,
    tripId: string,
    forMutation: boolean,
  ): Promise<TripRow> {
    const res = await client.query(`SELECT * FROM trip_drafts WHERE id = $1 FOR UPDATE`, [tripId]);
    const row = res.rows[0] as TripRow | undefined;
    if (!row || !this.canRead(actor, row)) {
      throw httpError(404, "NOT_FOUND", "Trip not found.");
    }
    if (forMutation) {
      if (actor.role === "observer" && this.canRead(actor, row)) {
        throw httpError(403, "FORBIDDEN", "Observers cannot modify trips.");
      }
      if (!this.canMutate(actor, row)) {
        throw httpError(404, "NOT_FOUND", "Trip not found.");
      }
    }
    return row;
  }

  private async findReceipt(
    client: Db | DbClient,
    actor: SessionActor,
    scope: string,
    commandId: string,
  ): Promise<CommandReceipt | null> {
    const res = await client.query(
      `SELECT body FROM command_receipts
       WHERE tenant_id = $1 AND actor_id = $2 AND resource_scope = $3 AND command_id = $4`,
      [actor.tenantId, actor.userId, scope, commandId],
    );
    if (!res.rowCount) return null;
    return res.rows[0].body as CommandReceipt;
  }

  private async storeReceipt(
    client: DbClient,
    actor: SessionActor,
    scope: string,
    commandId: string,
    action: string,
    inputHash: string,
    body: CommandReceipt,
  ): Promise<void> {
    await client.query(
      `INSERT INTO command_receipts
        (tenant_id, actor_id, resource_scope, command_id, action, input_hash, body, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        actor.tenantId,
        actor.userId,
        scope,
        commandId,
        action,
        inputHash,
        JSON.stringify(body),
        this.clock.now().toISOString(),
      ],
    );
  }

  async create(actor: SessionActor, commandId: string): Promise<CommandReceipt> {
    if (actor.role !== "traveler") {
      throw httpError(403, "FORBIDDEN", "Only travelers can create trips.");
    }
    assertCommandId(commandId);
    const scope = "create-trip";
    const action = "create";
    const inputHash = canonicalHash({ action, commandId });

    return withTransaction(this.db, async (client) => {
      const existing = await this.findReceipt(client, actor, scope, commandId);
      if (existing) {
        if (existing.action !== action) {
          throw httpError(409, "IDEMPOTENCY_CONFLICT", "Command ID reused with a different action.");
        }
        return existing;
      }

      const fields = defaultTripFields();
      const id = crypto.randomUUID();
      const now = this.clock.now().toISOString();
      await client.query(
        `INSERT INTO trip_drafts (
          id, tenant_id, owner_id, revision, status,
          origin, destination, departure_date, return_date,
          trip_type, passenger_count, cabin, purpose, created_at, updated_at
        ) VALUES ($1,$2,$3,1,'draft',$4,$5,$6,$7,$8,$9,$10,$11,$12,$12)`,
        [
          id,
          actor.tenantId,
          actor.userId,
          fields.origin,
          fields.destination,
          fields.departureDate,
          fields.returnDate,
          fields.tripType,
          fields.passengerCount,
          fields.cabin,
          fields.purpose,
          now,
        ],
      );

      const receipt: CommandReceipt = {
        commandId,
        outcome: "applied",
        tripId: id,
        fromRevision: null,
        toRevision: 1,
        fields,
        status: "draft",
        action,
      };
      await this.storeReceipt(client, actor, scope, commandId, action, inputHash, receipt);
      return receipt;
    });
  }

  async list(actor: SessionActor): Promise<TripView[]> {
    const res =
      actor.role === "observer"
        ? await this.db.query(
            `SELECT * FROM trip_drafts WHERE tenant_id = $1 ORDER BY updated_at DESC LIMIT 100`,
            [actor.tenantId],
          )
        : await this.db.query(
            `SELECT * FROM trip_drafts WHERE tenant_id = $1 AND owner_id = $2 ORDER BY updated_at DESC LIMIT 100`,
            [actor.tenantId, actor.userId],
          );
    return (res.rows as TripRow[]).map((r) => mapTrip(r));
  }

  async get(actor: SessionActor, tripId: string): Promise<TripView> {
    const res = await this.db.query(`SELECT * FROM trip_drafts WHERE id = $1`, [tripId]);
    const row = res.rows[0] as TripRow | undefined;
    if (!row || !this.canRead(actor, row)) {
      throw httpError(404, "NOT_FOUND", "Trip not found.");
    }
    let extras: Partial<TripView> = {};
    if (row.status === "submitted") {
      const sub = await this.db.query(`SELECT * FROM trip_submissions WHERE trip_id = $1`, [tripId]);
      if (sub.rowCount) {
        const s = sub.rows[0];
        extras = {
          submittedAt: new Date(s.submitted_at).toISOString(),
          reviewRequirements: s.review_requirements,
          policyVersion: s.policy_version,
        };
      }
    }
    return mapTrip(row, extras);
  }

  async patch(
    actor: SessionActor,
    tripId: string,
    expectedRevision: number,
    commandId: string,
    patch: TripPatch,
  ): Promise<CommandReceipt> {
    assertCommandId(commandId);
    const schema = parseTripPatch(patch);
    if (!schema.ok) {
      throw httpError(422, "INVALID_INPUT", schema.message, { fieldIssues: schema.fieldIssues });
    }
    const safePatch = schema.data;
    const action = "update";
    const inputHash = canonicalHash({ action, expectedRevision, patch: safePatch });

    return withTransaction(this.db, async (client) => {
      const existing = await this.findReceipt(client, actor, tripId, commandId);
      if (existing) {
        const priorHash = (
          await client.query(
            `SELECT input_hash, action FROM command_receipts
             WHERE tenant_id=$1 AND actor_id=$2 AND resource_scope=$3 AND command_id=$4`,
            [actor.tenantId, actor.userId, tripId, commandId],
          )
        ).rows[0] as { input_hash: string; action: string };
        if (priorHash.action !== action || priorHash.input_hash !== inputHash) {
          throw httpError(409, "IDEMPOTENCY_CONFLICT", "Command ID reused with different input.");
        }
        return existing;
      }

      const row = await this.loadAuthorized(client, actor, tripId, true);
      if (row.status !== "draft") {
        throw httpError(409, "NOT_EDITABLE", "Submitted trips cannot be edited.");
      }
      if (row.revision !== expectedRevision) {
        throw httpError(409, "REVISION_CONFLICT", "This draft changed. Review the latest saved version before applying changes.", {
          currentRevision: row.revision,
          retry: "refresh_and_review",
        });
      }

      const current = mapFields(row);
      const issues = validatePatchMerge(current, safePatch);
      if (issues.length) {
        throw httpError(422, "INVALID_INPUT", "Patch failed validation.", { fieldIssues: issues });
      }
      const merged = mergePatch(current, safePatch);
      if (fieldsEqual(current, merged)) {
        const receipt: CommandReceipt = {
          commandId,
          outcome: "no_change",
          tripId,
          fromRevision: row.revision,
          toRevision: row.revision,
          fields: current,
          status: row.status,
          action,
        };
        await this.storeReceipt(client, actor, tripId, commandId, action, inputHash, receipt);
        return receipt;
      }

      const now = this.clock.now().toISOString();
      const nextRevision = row.revision + 1;
      await client.query(
        `UPDATE trip_drafts SET
          revision=$1, origin=$2, destination=$3, departure_date=$4, return_date=$5,
          trip_type=$6, passenger_count=$7, cabin=$8, purpose=$9, updated_at=$10
         WHERE id=$11`,
        [
          nextRevision,
          merged.origin,
          merged.destination,
          merged.departureDate,
          merged.returnDate,
          merged.tripType,
          merged.passengerCount,
          merged.cabin,
          merged.purpose,
          now,
          tripId,
        ],
      );

      const receipt: CommandReceipt = {
        commandId,
        outcome: "applied",
        tripId,
        fromRevision: row.revision,
        toRevision: nextRevision,
        fields: merged,
        status: "draft",
        action,
      };
      await this.storeReceipt(client, actor, tripId, commandId, action, inputHash, receipt);
      return receipt;
    });
  }

  async validate(
    actor: SessionActor,
    tripId: string,
    expectedRevision: number,
  ): Promise<ValidationResult> {
    const res = await this.db.query(`SELECT * FROM trip_drafts WHERE id = $1`, [tripId]);
    const row = res.rows[0] as TripRow | undefined;
    if (!row || !this.canRead(actor, row)) {
      throw httpError(404, "NOT_FOUND", "Trip not found.");
    }
    if (row.revision !== expectedRevision) {
      throw httpError(409, "REVISION_CONFLICT", "This draft changed.", {
        currentRevision: row.revision,
        retry: "refresh_and_review",
      });
    }
    return validateTripDraft({
      tripId,
      revision: row.revision,
      fields: mapFields(row),
      canMutate: this.canMutate(actor, row),
      status: row.status,
      clock: this.clock,
      timeZone: this.timeZone,
    });
  }

  async submit(
    actor: SessionActor,
    tripId: string,
    expectedRevision: number,
    reviewedPolicyVersion: string,
    commandId: string,
  ): Promise<CommandReceipt> {
    assertCommandId(commandId);
    const action = "submit";
    const inputHash = canonicalHash({ action, expectedRevision, reviewedPolicyVersion });

    return withTransaction(this.db, async (client) => {
      const existing = await this.findReceipt(client, actor, tripId, commandId);
      if (existing) {
        const prior = (
          await client.query(
            `SELECT input_hash, action FROM command_receipts
             WHERE tenant_id=$1 AND actor_id=$2 AND resource_scope=$3 AND command_id=$4`,
            [actor.tenantId, actor.userId, tripId, commandId],
          )
        ).rows[0] as { input_hash: string; action: string };
        if (prior.action !== action || prior.input_hash !== inputHash) {
          throw httpError(409, "IDEMPOTENCY_CONFLICT", "Command ID reused with different input.");
        }
        return existing;
      }

      const row = await this.loadAuthorized(client, actor, tripId, true);
      const policy = await client.query(
        `SELECT version FROM policies WHERE tenant_id = $1 FOR UPDATE`,
        [actor.tenantId],
      );
      const policyVersion = String(policy.rows[0]?.version || POLICY_VERSION);
      if (reviewedPolicyVersion !== policyVersion) {
        throw httpError(409, "POLICY_CHANGED", "Policy changed. Rerun review.");
      }
      if (row.status === "submitted") {
        throw httpError(409, "NOT_EDITABLE", "Trip is already submitted.");
      }
      if (row.revision !== expectedRevision) {
        throw httpError(409, "REVISION_CONFLICT", "This draft changed.", {
          currentRevision: row.revision,
          retry: "refresh_and_review",
        });
      }

      const fields = mapFields(row);
      const validation = validateTripDraft({
        tripId,
        revision: row.revision,
        fields,
        canMutate: true,
        status: row.status,
        clock: this.clock,
        timeZone: this.timeZone,
      });
      if (!validation.canSubmit) {
        throw httpError(422, "INVALID_INPUT", "Trip is not ready to submit.", {
          fieldIssues: validation.fieldIssues,
        });
      }

      const now = this.clock.now().toISOString();
      const nextRevision = row.revision + 1;
      await client.query(
        `INSERT INTO trip_submissions
          (trip_id, tenant_id, owner_id, source_revision, policy_version, snapshot, review_requirements, submitted_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          tripId,
          actor.tenantId,
          actor.userId,
          row.revision,
          policyVersion,
          JSON.stringify(fields),
          JSON.stringify(validation.reviewRequirements),
          now,
        ],
      );
      await client.query(
        `UPDATE trip_drafts SET status='submitted', revision=$1, updated_at=$2 WHERE id=$3`,
        [nextRevision, now, tripId],
      );

      const receipt: CommandReceipt = {
        commandId,
        outcome: "applied",
        tripId,
        fromRevision: row.revision,
        toRevision: nextRevision,
        fields,
        status: "submitted",
        action,
      };
      await this.storeReceipt(client, actor, tripId, commandId, action, inputHash, receipt);
      return receipt;
    });
  }

  async getCommand(
    actor: SessionActor,
    tripId: string,
    commandId: string,
  ): Promise<CommandReceipt> {
    // Authorization: must be able to read the trip (or create-trip scope for own receipts)
    if (tripId !== "create-trip") {
      await this.get(actor, tripId);
    }
    const receipt = await this.findReceipt(this.db, actor, tripId, commandId);
    if (!receipt) throw httpError(404, "NOT_FOUND", "Command receipt not found.");
    return receipt;
  }
}
