import crypto from "node:crypto";
import type { Db, DbClient } from "../db/pool.js";
import { withTransaction } from "../db/pool.js";
import type { Clock } from "../../domain/clock.js";
import {
  defaultEventFields,
  EVENT_POLICY_VERSION,
  type EventCommandReceipt,
  type EventFields,
  type EventPatch,
  type EventStatus,
  type EventValidationResult,
  type EventView,
} from "../../domain/event-types.js";
import {
  assertEventCommandId,
  eventFieldsEqual,
  mergeEventPatch,
  validateEventDraft,
  validateEventPatchMerge,
} from "../../domain/event-rules.js";
import { parseEventPatch } from "../../domain/event-schemas.js";
import type { SessionActor } from "./session-service.js";

type EventRow = {
  id: string;
  tenant_id: string;
  owner_id: string;
  revision: number;
  status: EventStatus;
  title: string;
  start_date: string | null;
  end_date: string | null;
  time_zone: string;
  location_mode: EventFields["locationMode"];
  location_label: string;
  notes: string;
  created_at: Date | string;
  updated_at: Date | string;
};

function dateOnly(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function mapFields(row: EventRow): EventFields {
  return {
    title: row.title,
    startDate: dateOnly(row.start_date),
    endDate: dateOnly(row.end_date),
    timeZone: row.time_zone,
    locationMode: row.location_mode,
    locationLabel: row.location_label,
    notes: row.notes,
  };
}

function mapEvent(row: EventRow, extras: Partial<EventView> = {}): EventView {
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

export class EventService {
  constructor(
    private readonly db: Db,
    private readonly clock: Clock,
  ) {}

  private canRead(actor: SessionActor, row: EventRow): boolean {
    if (actor.tenantId !== row.tenant_id) return false;
    if (actor.role === "observer") return true;
    return actor.userId === row.owner_id;
  }

  private canMutate(actor: SessionActor, row: EventRow): boolean {
    return (
      actor.tenantId === row.tenant_id &&
      actor.role === "traveler" &&
      actor.userId === row.owner_id
    );
  }

  private async loadAuthorized(
    client: Db | DbClient,
    actor: SessionActor,
    eventId: string,
    forMutation: boolean,
  ): Promise<EventRow> {
    const res = await client.query(`SELECT * FROM event_drafts WHERE id = $1 FOR UPDATE`, [eventId]);
    const row = res.rows[0] as EventRow | undefined;
    if (!row || !this.canRead(actor, row)) {
      throw httpError(404, "NOT_FOUND", "Event not found.");
    }
    if (forMutation) {
      if (actor.role === "observer" && this.canRead(actor, row)) {
        throw httpError(403, "FORBIDDEN", "Observers cannot modify events.");
      }
      if (!this.canMutate(actor, row)) {
        throw httpError(404, "NOT_FOUND", "Event not found.");
      }
    }
    return row;
  }

  private async findReceipt(
    client: Db | DbClient,
    actor: SessionActor,
    scope: string,
    commandId: string,
  ): Promise<EventCommandReceipt | null> {
    const res = await client.query(
      `SELECT body FROM command_receipts
       WHERE tenant_id = $1 AND actor_id = $2 AND resource_scope = $3 AND command_id = $4`,
      [actor.tenantId, actor.userId, scope, commandId],
    );
    if (!res.rowCount) return null;
    return res.rows[0].body as EventCommandReceipt;
  }

  private async storeReceipt(
    client: DbClient,
    actor: SessionActor,
    scope: string,
    commandId: string,
    action: string,
    inputHash: string,
    body: EventCommandReceipt,
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

  async create(actor: SessionActor, commandId: string): Promise<EventCommandReceipt> {
    if (actor.role !== "traveler") {
      throw httpError(403, "FORBIDDEN", "Only travelers can create events.");
    }
    assertEventCommandId(commandId);
    const scope = "create-event";
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

      const fields = defaultEventFields();
      const id = crypto.randomUUID();
      const now = this.clock.now().toISOString();
      await client.query(
        `INSERT INTO event_drafts (
          id, tenant_id, owner_id, revision, status,
          title, start_date, end_date, time_zone, location_mode, location_label, notes,
          created_at, updated_at
        ) VALUES ($1,$2,$3,1,'draft',$4,$5,$6,$7,$8,$9,$10,$11,$11)`,
        [
          id,
          actor.tenantId,
          actor.userId,
          fields.title,
          fields.startDate,
          fields.endDate,
          fields.timeZone,
          fields.locationMode,
          fields.locationLabel,
          fields.notes,
          now,
        ],
      );

      const receipt: EventCommandReceipt = {
        commandId,
        outcome: "applied",
        eventId: id,
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

  async list(actor: SessionActor): Promise<EventView[]> {
    const res =
      actor.role === "observer"
        ? await this.db.query(
            `SELECT * FROM event_drafts WHERE tenant_id = $1 ORDER BY updated_at DESC LIMIT 100`,
            [actor.tenantId],
          )
        : await this.db.query(
            `SELECT * FROM event_drafts WHERE tenant_id = $1 AND owner_id = $2 ORDER BY updated_at DESC LIMIT 100`,
            [actor.tenantId, actor.userId],
          );
    return (res.rows as EventRow[]).map((r) => mapEvent(r));
  }

  async get(actor: SessionActor, eventId: string): Promise<EventView> {
    const res = await this.db.query(`SELECT * FROM event_drafts WHERE id = $1`, [eventId]);
    const row = res.rows[0] as EventRow | undefined;
    if (!row || !this.canRead(actor, row)) {
      throw httpError(404, "NOT_FOUND", "Event not found.");
    }
    let extras: Partial<EventView> = {};
    if (row.status === "submitted") {
      const sub = await this.db.query(`SELECT * FROM event_submissions WHERE event_id = $1`, [
        eventId,
      ]);
      if (sub.rowCount) {
        const s = sub.rows[0];
        extras = {
          submittedAt: new Date(s.submitted_at).toISOString(),
          reviewRequirements: s.review_requirements,
          policyVersion: s.policy_version,
        };
      }
    }
    return mapEvent(row, extras);
  }

  async patch(
    actor: SessionActor,
    eventId: string,
    expectedRevision: number,
    commandId: string,
    patch: EventPatch,
  ): Promise<EventCommandReceipt> {
    assertEventCommandId(commandId);
    const schema = parseEventPatch(patch);
    if (!schema.ok) {
      throw httpError(422, "INVALID_INPUT", schema.message, { fieldIssues: schema.fieldIssues });
    }
    const safePatch = schema.data;
    const action = "update";
    const inputHash = canonicalHash({ action, expectedRevision, patch: safePatch });

    return withTransaction(this.db, async (client) => {
      const existing = await this.findReceipt(client, actor, eventId, commandId);
      if (existing) {
        const priorHash = (
          await client.query(
            `SELECT input_hash, action FROM command_receipts
             WHERE tenant_id=$1 AND actor_id=$2 AND resource_scope=$3 AND command_id=$4`,
            [actor.tenantId, actor.userId, eventId, commandId],
          )
        ).rows[0] as { input_hash: string; action: string };
        if (priorHash.action !== action || priorHash.input_hash !== inputHash) {
          throw httpError(409, "IDEMPOTENCY_CONFLICT", "Command ID reused with different input.");
        }
        return existing;
      }

      const row = await this.loadAuthorized(client, actor, eventId, true);
      if (row.status !== "draft") {
        throw httpError(409, "NOT_EDITABLE", "Submitted events cannot be edited.");
      }
      if (row.revision !== expectedRevision) {
        throw httpError(
          409,
          "REVISION_CONFLICT",
          "This draft changed. Review the latest saved version before applying changes.",
          { currentRevision: row.revision, retry: "refresh_and_review" },
        );
      }

      const current = mapFields(row);
      const issues = validateEventPatchMerge(current, safePatch);
      if (issues.length) {
        throw httpError(422, "INVALID_INPUT", "Patch failed validation.", { fieldIssues: issues });
      }
      const merged = mergeEventPatch(current, safePatch);
      if (eventFieldsEqual(current, merged)) {
        const receipt: EventCommandReceipt = {
          commandId,
          outcome: "no_change",
          eventId,
          fromRevision: row.revision,
          toRevision: row.revision,
          fields: current,
          status: row.status,
          action,
        };
        await this.storeReceipt(client, actor, eventId, commandId, action, inputHash, receipt);
        return receipt;
      }

      const now = this.clock.now().toISOString();
      const nextRevision = row.revision + 1;
      await client.query(
        `UPDATE event_drafts SET
          revision=$1, title=$2, start_date=$3, end_date=$4, time_zone=$5,
          location_mode=$6, location_label=$7, notes=$8, updated_at=$9
         WHERE id=$10`,
        [
          nextRevision,
          merged.title,
          merged.startDate,
          merged.endDate,
          merged.timeZone,
          merged.locationMode,
          merged.locationLabel,
          merged.notes,
          now,
          eventId,
        ],
      );

      const receipt: EventCommandReceipt = {
        commandId,
        outcome: "applied",
        eventId,
        fromRevision: row.revision,
        toRevision: nextRevision,
        fields: merged,
        status: "draft",
        action,
      };
      await this.storeReceipt(client, actor, eventId, commandId, action, inputHash, receipt);
      return receipt;
    });
  }

  async validate(
    actor: SessionActor,
    eventId: string,
    expectedRevision: number,
  ): Promise<EventValidationResult> {
    const res = await this.db.query(`SELECT * FROM event_drafts WHERE id = $1`, [eventId]);
    const row = res.rows[0] as EventRow | undefined;
    if (!row || !this.canRead(actor, row)) {
      throw httpError(404, "NOT_FOUND", "Event not found.");
    }
    if (row.revision !== expectedRevision) {
      throw httpError(409, "REVISION_CONFLICT", "This draft changed.", {
        currentRevision: row.revision,
        retry: "refresh_and_review",
      });
    }
    return validateEventDraft({
      eventId,
      revision: row.revision,
      fields: mapFields(row),
      status: row.status,
      clock: this.clock,
    });
  }

  async submit(
    actor: SessionActor,
    eventId: string,
    expectedRevision: number,
    reviewedPolicyVersion: string,
    commandId: string,
  ): Promise<EventCommandReceipt> {
    assertEventCommandId(commandId);
    const action = "submit";
    const inputHash = canonicalHash({ action, expectedRevision, reviewedPolicyVersion });

    return withTransaction(this.db, async (client) => {
      const existing = await this.findReceipt(client, actor, eventId, commandId);
      if (existing) {
        const prior = (
          await client.query(
            `SELECT input_hash, action FROM command_receipts
             WHERE tenant_id=$1 AND actor_id=$2 AND resource_scope=$3 AND command_id=$4`,
            [actor.tenantId, actor.userId, eventId, commandId],
          )
        ).rows[0] as { input_hash: string; action: string };
        if (prior.action !== action || prior.input_hash !== inputHash) {
          throw httpError(409, "IDEMPOTENCY_CONFLICT", "Command ID reused with different input.");
        }
        return existing;
      }

      const row = await this.loadAuthorized(client, actor, eventId, true);
      if (reviewedPolicyVersion !== EVENT_POLICY_VERSION) {
        throw httpError(409, "POLICY_CHANGED", "Policy changed. Rerun review.");
      }
      if (row.status === "submitted") {
        throw httpError(409, "NOT_EDITABLE", "Event is already submitted.");
      }
      if (row.revision !== expectedRevision) {
        throw httpError(409, "REVISION_CONFLICT", "This draft changed.", {
          currentRevision: row.revision,
          retry: "refresh_and_review",
        });
      }

      const fields = mapFields(row);
      const validation = validateEventDraft({
        eventId,
        revision: row.revision,
        fields,
        status: row.status,
        clock: this.clock,
      });
      if (!validation.canSubmit) {
        throw httpError(422, "INVALID_INPUT", "Event is not ready to submit.", {
          fieldIssues: validation.fieldIssues,
        });
      }

      const now = this.clock.now().toISOString();
      const nextRevision = row.revision + 1;
      await client.query(
        `INSERT INTO event_submissions
          (event_id, tenant_id, owner_id, source_revision, policy_version, snapshot, review_requirements, submitted_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          eventId,
          actor.tenantId,
          actor.userId,
          row.revision,
          EVENT_POLICY_VERSION,
          JSON.stringify(fields),
          JSON.stringify(validation.reviewRequirements),
          now,
        ],
      );
      await client.query(
        `UPDATE event_drafts SET status='submitted', revision=$1, updated_at=$2 WHERE id=$3`,
        [nextRevision, now, eventId],
      );

      const receipt: EventCommandReceipt = {
        commandId,
        outcome: "applied",
        eventId,
        fromRevision: row.revision,
        toRevision: nextRevision,
        fields,
        status: "submitted",
        action,
      };
      await this.storeReceipt(client, actor, eventId, commandId, action, inputHash, receipt);
      return receipt;
    });
  }

  async getCommand(
    actor: SessionActor,
    eventId: string,
    commandId: string,
  ): Promise<EventCommandReceipt> {
    if (eventId !== "create-event") {
      await this.get(actor, eventId);
    }
    const receipt = await this.findReceipt(this.db, actor, eventId, commandId);
    if (!receipt) throw httpError(404, "NOT_FOUND", "Command receipt not found.");
    return receipt;
  }
}
