import type { Request, Response, NextFunction } from "express";
import type { SessionService, SessionActor } from "../services/session-service.js";

export type AuthedRequest = Request & { actor?: SessionActor | null };

export function sessionMiddleware(sessions: SessionService, cookieName: string) {
  return async (req: AuthedRequest, _res: Response, next: NextFunction) => {
    try {
      const token = req.cookies?.[cookieName] as string | undefined;
      req.actor = await sessions.resolve(token);
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.actor) {
    res.status(401).json({ ok: false, error: { code: "UNAUTHENTICATED", message: "Authentication required" } });
    return;
  }
  next();
}

export function requireCsrf(cookieName: string) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
      next();
      return;
    }
    // Login establishes the session; CSRF applies after authentication
    if (req.path === "/session" && req.method === "POST") {
      next();
      return;
    }
    if (!req.actor) {
      next();
      return;
    }
    const header = req.get("x-csrf-token");
    if (!header || header !== req.actor.csrfToken) {
      res.status(403).json({
        ok: false,
        error: { code: "FORBIDDEN", message: "CSRF token missing or invalid" },
      });
      return;
    }
    const origin = req.get("origin");
    if (origin) {
      try {
        const host = new URL(origin).hostname;
        if (host !== "localhost" && host !== "127.0.0.1") {
          res.status(403).json({
            ok: false,
            error: { code: "FORBIDDEN", message: "Origin not allowed" },
          });
          return;
        }
      } catch {
        res.status(403).json({
          ok: false,
          error: { code: "FORBIDDEN", message: "Origin not allowed" },
        });
        return;
      }
    }
    void cookieName;
    next();
  };
}
