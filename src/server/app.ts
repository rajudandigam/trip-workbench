import express from "express";
import cookieParser from "cookie-parser";
import path from "node:path";
import type { AppConfig } from "./config.js";
import type { Db } from "./db/pool.js";
import { SessionService } from "./services/session-service.js";
import { TripService } from "./services/trip-service.js";
import { createApiRouter } from "./routes/api.js";
import { requireCsrf, sessionMiddleware } from "./middleware/session.js";

export function createApp(config: AppConfig, db: Db) {
  const app = express();
  const sessions = new SessionService(db, config.clock, config.sessionSecret);
  const trips = new TripService(db, config.clock, config.timeZone);

  app.disable("x-powered-by");
  app.use(express.json({ limit: "32kb" }));
  app.use(cookieParser());
  app.use(sessionMiddleware(sessions, config.cookieName));
  app.use("/api", requireCsrf(config.cookieName));
  app.use("/api", createApiRouter({ config, db, sessions, trips }));

  if (config.nodeEnv === "production") {
    const clientDir = path.resolve(process.cwd(), "dist/client");
    app.use(express.static(clientDir));
    app.get(/.*/, (_req, res) => {
      res.sendFile(path.join(clientDir, "index.html"));
    });
  }

  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      const error = err as { status?: number; code?: string; message?: string; name?: string };
      if (error.name === "ZodError") {
        res.status(422).json({
          ok: false,
          error: { code: "INVALID_INPUT", message: "Request failed validation." },
        });
        return;
      }
      console.error(err);
      res.status(error.status || 500).json({
        ok: false,
        error: {
          code: error.code || "INTERNAL",
          message: error.message || "Unexpected error",
        },
      });
    },
  );

  return app;
}
