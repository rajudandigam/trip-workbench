import "./load-env.js";
import { assertSafeDatabaseUrl, loadConfig } from "../src/server/config.js";
import { createPool } from "../src/server/db/pool.js";
import { runMigrations } from "../src/server/db/migrate.js";

async function main() {
  const config = loadConfig();
  assertSafeDatabaseUrl(config.databaseUrl, config.allowedDbNamePattern);
  const db = createPool(config.databaseUrl);
  const applied = await runMigrations(db);
  console.log(JSON.stringify({ ok: true, applied }));
  await db.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
