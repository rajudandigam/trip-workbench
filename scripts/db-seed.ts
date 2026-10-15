import "./load-env.js";
import { assertSafeDatabaseUrl, loadConfig } from "../src/server/config.js";
import { createPool } from "../src/server/db/pool.js";
import { seedDatabase } from "../src/server/db/seed.js";

async function main() {
  const config = loadConfig();
  assertSafeDatabaseUrl(config.databaseUrl, config.allowedDbNamePattern);
  const db = createPool(config.databaseUrl);
  await seedDatabase(db, config.seedPassword);
  console.log(JSON.stringify({ ok: true, seeded: true }));
  await db.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
