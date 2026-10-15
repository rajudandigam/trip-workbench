import fs from "node:fs";
import path from "node:path";
import type { Db } from "./pool.js";

export async function requiredMigrationsApplied(db: Db): Promise<boolean> {
  try {
    const res = await db.query(
      `SELECT 1 FROM schema_migrations WHERE id = $1`,
      ["001_init.sql"],
    );
    return res.rowCount === 1;
  } catch {
    return false;
  }
}

export async function runMigrations(db: Db): Promise<string[]> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const dir = path.resolve(process.cwd(), "migrations");
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const applied: string[] = [];

  for (const file of files) {
    const exists = await db.query(`SELECT 1 FROM schema_migrations WHERE id = $1`, [file]);
    if (exists.rowCount) continue;
    const sql = fs.readFileSync(path.join(dir, file), "utf8");
    await db.query("BEGIN");
    try {
      await db.query(sql);
      await db.query(`INSERT INTO schema_migrations (id) VALUES ($1)`, [file]);
      await db.query("COMMIT");
      applied.push(file);
    } catch (error) {
      await db.query("ROLLBACK");
      throw error;
    }
  }
  return applied;
}
