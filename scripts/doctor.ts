import "./load-env.js";
import fs from "node:fs";
import pg from "pg";

async function main() {
  const report: Record<string, unknown> = {
    node: process.version,
    npm: process.env.npm_config_user_agent || null,
    cwd: process.cwd(),
    envFile: fs.existsSync(".env"),
    databaseUrlSet: Boolean(process.env.DATABASE_URL),
    aiMode: process.env.AI_MODE || "disabled",
  };
  if (process.env.DATABASE_URL) {
    try {
      const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
      await client.connect();
      await client.query("SELECT 1");
      await client.end();
      report.database = "reachable";
    } catch (error) {
      report.database = `unreachable: ${(error as Error).message}`;
    }
  }
  console.log(JSON.stringify(report, null, 2));
}

main();
