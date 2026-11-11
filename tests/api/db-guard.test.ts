import { afterEach, describe, expect, it } from "vitest";
import { createPool } from "../../src/server/db/pool.js";
import { startTestApp } from "./helpers.js";

describe("startTestApp disposable database refusal", () => {
  const originalTestUrl = process.env.TEST_DATABASE_URL;
  const originalAppUrl = process.env.DATABASE_URL;
  const originalIsolated = process.env.TW_ISOLATED_TEST_DB;

  afterEach(() => {
    if (originalTestUrl === undefined) delete process.env.TEST_DATABASE_URL;
    else process.env.TEST_DATABASE_URL = originalTestUrl;
    if (originalAppUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalAppUrl;
    if (originalIsolated === undefined) delete process.env.TW_ISOLATED_TEST_DB;
    else process.env.TW_ISOLATED_TEST_DB = originalIsolated;
  });

  it("refuses migrate/seed when TEST_DATABASE_URL is missing and leaves prior data intact", async () => {
    if (!originalTestUrl) {
      throw new Error("TEST_DATABASE_URL must be set in the environment for API tests");
    }

    const app = await startTestApp();
    const sentinel = "b3fb7260-f722-46e8-a89c-25c7f4471ade";
    await app.db.query(
      `INSERT INTO trip_drafts (
         id, tenant_id, owner_id, revision, status, trip_type,
         passenger_count, cabin, purpose, created_at, updated_at
       )
       SELECT $1, tenant_id, id, 1, 'draft', 'one_way', 1, 'economy',
              'disposable sentinel', now(), now()
       FROM users WHERE email = 'alex@northstar.demo'
       ON CONFLICT (id) DO UPDATE SET purpose = EXCLUDED.purpose`,
      [sentinel],
    );
    const before = await app.db.query(
      `SELECT count(*)::integer AS n FROM trip_drafts WHERE id = $1`,
      [sentinel],
    );
    expect(before.rows[0].n).toBe(1);
    await app.close();

    delete process.env.TEST_DATABASE_URL;
    await expect(startTestApp()).rejects.toThrow(/TEST_DATABASE_URL is required/);

    // Read the disposable DB directly — do not re-seed — to prove prior data survived.
    const probe = createPool(originalTestUrl);
    try {
      const after = await probe.query(
        `SELECT count(*)::integer AS n, max(purpose) AS purpose
         FROM trip_drafts WHERE id = $1`,
        [sentinel],
      );
      expect(after.rows[0].n).toBe(1);
      expect(after.rows[0].purpose).toBe("disposable sentinel");
      await probe.query(`DELETE FROM trip_drafts WHERE id = $1`, [sentinel]);
    } finally {
      await probe.end();
    }
  });
});
