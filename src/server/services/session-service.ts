import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import type { Db } from "../db/pool.js";
import type { Clock } from "../../domain/clock.js";
import type { UserRole } from "../../domain/types.js";

const SESSION_TTL_MS = 1000 * 60 * 60 * 8;

export type SessionActor = {
  userId: string;
  tenantId: string;
  email: string;
  displayName: string;
  role: UserRole;
  csrfToken: string;
  sessionId: string;
};

export class SessionService {
  constructor(
    private readonly db: Db,
    private readonly clock: Clock,
    private readonly sessionSecret: string,
  ) {}

  private hashToken(token: string): string {
    return crypto.createHmac("sha256", this.sessionSecret).update(token).digest("hex");
  }

  async login(email: string, password: string): Promise<{ token: string; actor: SessionActor }> {
    const res = await this.db.query(
      `SELECT id, tenant_id, email, display_name, password_hash, role FROM users WHERE email = $1`,
      [email.toLowerCase()],
    );
    const row = res.rows[0] as
      | {
          id: string;
          tenant_id: string;
          email: string;
          display_name: string;
          password_hash: string;
          role: UserRole;
        }
      | undefined;
    if (!row || !(await bcrypt.compare(password, row.password_hash))) {
      throw Object.assign(new Error("Invalid email or password"), {
        status: 401,
        code: "UNAUTHENTICATED",
      });
    }

    const token = crypto.randomBytes(32).toString("hex");
    const csrfToken = crypto.randomBytes(24).toString("hex");
    const sessionId = crypto.randomUUID();
    const expires = new Date(this.clock.now().getTime() + SESSION_TTL_MS);

    await this.db.query(`DELETE FROM sessions WHERE user_id = $1`, [row.id]);
    await this.db.query(
      `INSERT INTO sessions (id, user_id, token_hash, csrf_token, expires_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [sessionId, row.id, this.hashToken(token), csrfToken, expires.toISOString(), this.clock.now().toISOString()],
    );

    return {
      token,
      actor: {
        userId: row.id,
        tenantId: row.tenant_id,
        email: row.email,
        displayName: row.display_name,
        role: row.role,
        csrfToken,
        sessionId,
      },
    };
  }

  async resolve(token: string | undefined): Promise<SessionActor | null> {
    if (!token) return null;
    const res = await this.db.query(
      `SELECT s.id AS session_id, s.csrf_token, s.expires_at,
              u.id AS user_id, u.tenant_id, u.email, u.display_name, u.role
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1`,
      [this.hashToken(token)],
    );
    const row = res.rows[0] as
      | {
          session_id: string;
          csrf_token: string;
          expires_at: Date | string;
          user_id: string;
          tenant_id: string;
          email: string;
          display_name: string;
          role: UserRole;
        }
      | undefined;
    if (!row) return null;
    if (new Date(row.expires_at).getTime() <= this.clock.now().getTime()) {
      await this.db.query(`DELETE FROM sessions WHERE id = $1`, [row.session_id]);
      return null;
    }
    return {
      userId: row.user_id,
      tenantId: row.tenant_id,
      email: row.email,
      displayName: row.display_name,
      role: row.role,
      csrfToken: row.csrf_token,
      sessionId: row.session_id,
    };
  }

  async logout(token: string | undefined): Promise<void> {
    if (!token) return;
    await this.db.query(`DELETE FROM sessions WHERE token_hash = $1`, [this.hashToken(token)]);
  }
}
