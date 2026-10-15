import { Router } from "express";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import type { Db } from "../db/pool.js";
import { requiredMigrationsApplied } from "../db/migrate.js";
import type { SessionService } from "../services/session-service.js";
import type { TripService } from "../services/trip-service.js";
import { requireAuth, type AuthedRequest } from "../middleware/session.js";
import { AIRPORTS, CABINS, POLICY_VERSION } from "../../domain/types.js";
import { calendarDateInTimezone } from "../../domain/clock.js";
import { createProposal } from "../adapters/gemini.js";
import { inspectRun, inspectStep } from "../adapters/inspect.js";
import {
  CommandIdSchema,
  ExpectedRevisionSchema,
  HttpTripPatchBodySchema,
  zodErrorToHttp,
  zodIssuesToFieldIssues,
} from "../../domain/trip-schemas.js";

function sendError(res: import("express").Response, error: unknown) {
  if (error instanceof z.ZodError) {
    res.status(422).json({
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: "Request failed validation.",
        fieldIssues: zodIssuesToFieldIssues(error),
      },
    });
    return;
  }
  const err = error as {
    status?: number;
    code?: string;
    message?: string;
    fieldIssues?: unknown;
    currentRevision?: number;
    retry?: string;
    name?: string;
  };
  if (err.name === "ZodError") {
    const httpErr = zodErrorToHttp(error as z.ZodError);
    res.status(httpErr.status).json({
      ok: false,
      error: {
        code: httpErr.code,
        message: httpErr.message,
        fieldIssues: httpErr.fieldIssues,
      },
    });
    return;
  }
  const status = err.status || 500;
  res.status(status).json({
    ok: false,
    error: {
      code: err.code || "INTERNAL",
      message: err.message || "Unexpected error",
      ...(err.fieldIssues ? { fieldIssues: err.fieldIssues } : {}),
      ...(err.currentRevision != null ? { currentRevision: err.currentRevision } : {}),
      ...(err.retry ? { retry: err.retry } : {}),
    },
  });
}

export function createApiRouter(deps: {
  config: AppConfig;
  db: Db;
  sessions: SessionService;
  trips: TripService;
}): Router {
  const router = Router();
  const { config, db, sessions, trips } = deps;

  router.get("/health", async (_req, res) => {
    try {
      await db.query("SELECT 1");
      const migrationsOk = await requiredMigrationsApplied(db);
      if (!migrationsOk) {
        res.status(503).json({
          status: "not-ready",
          database: true,
          migrations: false,
          aiMode: config.aiMode,
        });
        return;
      }
      res.json({
        status: "ready",
        database: true,
        migrations: true,
        aiMode: config.aiMode,
        timeZone: config.timeZone,
        now: config.clock.now().toISOString(),
      });
    } catch {
      res.status(503).json({ status: "not-ready", database: false, migrations: false });
    }
  });

  router.post("/session", async (req, res) => {
    try {
      const body = z
        .object({ email: z.string().email(), password: z.string().min(1) })
        .parse(req.body);
      const { token, actor } = await sessions.login(body.email, body.password);
      res.cookie(config.cookieName, token, {
        httpOnly: true,
        sameSite: "lax",
        secure: config.nodeEnv === "production",
        path: "/",
      });
      res.json({
        ok: true,
        data: {
          email: actor.email,
          displayName: actor.displayName,
          role: actor.role,
          tenantId: actor.tenantId,
          csrfToken: actor.csrfToken,
          capabilities: {
            canMutateTrips: actor.role === "traveler",
            aiMode: config.aiMode,
          },
        },
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get("/session", async (req: AuthedRequest, res) => {
    if (!req.actor) {
      res.status(401).json({
        ok: false,
        error: { code: "UNAUTHENTICATED", message: "Authentication required" },
      });
      return;
    }
    res.json({
      ok: true,
      data: {
        email: req.actor.email,
        displayName: req.actor.displayName,
        role: req.actor.role,
        tenantId: req.actor.tenantId,
        csrfToken: req.actor.csrfToken,
        capabilities: {
          canMutateTrips: req.actor.role === "traveler",
          aiMode: config.aiMode,
        },
      },
    });
  });

  router.delete("/session", async (req, res) => {
    try {
      const token = req.cookies?.[config.cookieName] as string | undefined;
      await sessions.logout(token);
      res.clearCookie(config.cookieName, { path: "/" });
      res.json({ ok: true, data: { signedOut: true } });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get("/reference-data", requireAuth, async (_req, res) => {
    res.json({
      ok: true,
      data: {
        airports: AIRPORTS,
        cabins: CABINS,
        timeZone: config.timeZone,
        policyVersion: POLICY_VERSION,
        policySummary: [
          "Premium economy and business require review.",
          "Departure within seven calendar days requires review.",
        ],
      },
    });
  });

  router.get("/trips", requireAuth, async (req: AuthedRequest, res) => {
    try {
      const list = await trips.list(req.actor!);
      res.json({ ok: true, data: list });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/trips", requireAuth, async (req: AuthedRequest, res) => {
    try {
      const body = z.object({ commandId: CommandIdSchema }).strict().parse(req.body);
      const receipt = await trips.create(req.actor!, body.commandId);
      res.status(201).json({ ok: true, data: receipt });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get("/trips/:id", requireAuth, async (req: AuthedRequest, res) => {
    try {
      const trip = await trips.get(req.actor!, String(req.params.id));
      res.json({ ok: true, data: trip });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.patch("/trips/:id", requireAuth, async (req: AuthedRequest, res) => {
    try {
      const body = HttpTripPatchBodySchema.parse(req.body);
      const receipt = await trips.patch(
        req.actor!,
        String(req.params.id),
        body.expectedRevision,
        body.commandId,
        body.patch,
      );
      res.json({ ok: true, data: receipt });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/trips/:id/validate", requireAuth, async (req: AuthedRequest, res) => {
    try {
      const body = z
        .object({ expectedRevision: ExpectedRevisionSchema })
        .strict()
        .parse(req.body);
      const result = await trips.validate(req.actor!, String(req.params.id), body.expectedRevision);
      res.json({ ok: true, data: result });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/trips/:id/submit", requireAuth, async (req: AuthedRequest, res) => {
    try {
      const body = z
        .object({
          expectedRevision: ExpectedRevisionSchema,
          reviewedPolicyVersion: z.string().min(1),
          commandId: CommandIdSchema,
        })
        .strict()
        .parse(req.body);
      const receipt = await trips.submit(
        req.actor!,
        String(req.params.id),
        body.expectedRevision,
        body.reviewedPolicyVersion,
        body.commandId,
      );
      res.json({ ok: true, data: receipt });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get("/trips/:id/commands/:commandId", requireAuth, async (req: AuthedRequest, res) => {
    try {
      const receipt = await trips.getCommand(
        req.actor!,
        String(req.params.id),
        String(req.params.commandId),
      );
      res.json({ ok: true, data: receipt });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/trips/:id/proposal", requireAuth, async (req: AuthedRequest, res) => {
    try {
      const body = z
        .object({
          brief: z.string().min(1).max(4000),
          expectedRevision: z.number().int().positive(),
          clientEditVersion: z.number().int().nonnegative(),
          briefVersion: z.number().int().nonnegative(),
        })
        .parse(req.body);
      const trip = await trips.get(req.actor!, String(req.params.id));
      if (trip.revision !== body.expectedRevision) {
        res.status(409).json({
          ok: false,
          error: {
            code: "REVISION_CONFLICT",
            message: "This draft changed.",
            currentRevision: trip.revision,
            retry: "refresh_and_review",
          },
        });
        return;
      }
      if (req.actor!.role !== "traveler") {
        res.status(403).json({
          ok: false,
          error: { code: "FORBIDDEN", message: "Observers cannot request proposals." },
        });
        return;
      }
      const result = await inspectRun(
        "gemini-proposal",
        async () => {
          const proposal = await createProposal(config, {
            brief: body.brief,
            fields: trip.fields,
            expectedRevision: body.expectedRevision,
            clientEditVersion: body.clientEditVersion,
            briefVersion: body.briefVersion,
            referenceDate: calendarDateInTimezone(config.clock.now(), config.timeZone),
            timeZone: config.timeZone,
          });
          inspectStep("gemini-proposal-steps", "proposal.created", {
            tripId: trip.id,
            mode: proposal.mode,
            clarificationCount: proposal.proposal.clarifications.length,
          });
          return proposal;
        },
        { silent: true },
      );
      res.json({ ok: true, data: result });
    } catch (error) {
      sendError(res, error);
    }
  });

  return router;
}
