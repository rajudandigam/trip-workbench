import "./load-env.js";
import { spawnSync } from "node:child_process";
import pg from "pg";

async function ensureDatabase(adminUrl: string, dbName: string) {
  const client = new pg.Client({ connectionString: adminUrl });
  await client.connect();
  try {
    const exists = await client.query(`SELECT 1 FROM pg_database WHERE datname = $1`, [dbName]);
    if (!exists.rowCount) {
      await client.query(`CREATE DATABASE "${dbName}"`);
      console.log(`Created database ${dbName}`);
    } else {
      console.log(`Database ${dbName} already exists`);
    }
  } finally {
    await client.end();
  }
}

async function waitForAdmin(adminUrl: string) {
  for (let i = 0; i < 40; i++) {
    try {
      const c = new pg.Client({ connectionString: adminUrl });
      await c.connect();
      await c.query("SELECT 1");
      await c.end();
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error(`Postgres not reachable via ${adminUrl}`);
}

async function main() {
  const compose = spawnSync("docker", ["compose", "up", "-d"], { stdio: "inherit" });
  if (compose.status !== 0) {
    console.warn("docker compose unavailable; using existing local Postgres from DATABASE_URL.");
  }

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL required");
  const parsed = new URL(url);
  const dbName = parsed.pathname.replace(/^\//, "");
  const admin = new URL(url);
  admin.pathname = "/postgres";

  await waitForAdmin(admin.toString());
  await ensureDatabase(admin.toString(), dbName);

  const testUrl = process.env.TEST_DATABASE_URL;
  if (testUrl) {
    const testName = new URL(testUrl).pathname.replace(/^\//, "");
    const testAdmin = new URL(testUrl);
    testAdmin.pathname = "/postgres";
    await ensureDatabase(testAdmin.toString(), testName);
  }
  console.log("Database ready");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
