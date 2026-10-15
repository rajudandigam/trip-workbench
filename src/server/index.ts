import "./load-env-sideeffect.js";
import { loadConfig } from "./config.js";
import { createPool } from "./db/pool.js";
import { createApp } from "./app.js";

async function main() {
  const config = loadConfig();
  const db = createPool(config.databaseUrl);
  const app = createApp(config, db);
  const port = config.nodeEnv === "production" ? config.port : config.apiPort;
  app.listen(port, () => {
    console.log(
      JSON.stringify({
        event: "server_started",
        port,
        mode: config.nodeEnv,
        aiMode: config.aiMode,
      }),
    );
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
