import bcrypt from "bcryptjs";
import type { Db } from "./pool.js";
import { POLICY_VERSION } from "../../domain/types.js";

export const SEED_IDS = {
  northstar: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  cedar: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  alex: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  jordan: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  observer: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  casey: "ffffffff-ffff-4fff-8fff-ffffffffffff",
} as const;

export async function seedDatabase(db: Db, seedPassword: string): Promise<void> {
  const hash = await bcrypt.hash(seedPassword, 10);
  await db.query("BEGIN");
  try {
    await db.query(`DELETE FROM trip_submissions`);
    await db.query(`DELETE FROM command_receipts`);
    await db.query(`DELETE FROM trip_drafts`);
    await db.query(`DELETE FROM sessions`);
    await db.query(`DELETE FROM policies`);
    await db.query(`DELETE FROM users`);
    await db.query(`DELETE FROM tenants`);

    await db.query(`INSERT INTO tenants (id, name) VALUES ($1, $2), ($3, $4)`, [
      SEED_IDS.northstar,
      "Northstar Demo",
      SEED_IDS.cedar,
      "Cedar Demo",
    ]);

    await db.query(
      `INSERT INTO users (id, tenant_id, email, display_name, password_hash, role) VALUES
        ($1, $2, 'alex@northstar.demo', 'Alex Morgan', $3, 'traveler'),
        ($4, $2, 'jordan@northstar.demo', 'Jordan Lee', $3, 'traveler'),
        ($5, $2, 'observer@northstar.demo', 'Riley Observer', $3, 'observer'),
        ($6, $7, 'casey@cedar.demo', 'Casey Rivera', $3, 'traveler')`,
      [
        SEED_IDS.alex,
        SEED_IDS.northstar,
        hash,
        SEED_IDS.jordan,
        SEED_IDS.observer,
        SEED_IDS.casey,
        SEED_IDS.cedar,
      ],
    );

    await db.query(
      `INSERT INTO policies (tenant_id, version) VALUES ($1, $2), ($3, $2)`,
      [SEED_IDS.northstar, POLICY_VERSION, SEED_IDS.cedar],
    );

    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
}
