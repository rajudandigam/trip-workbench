import "./load-env-sideeffect.js";
import { loadConfig } from "./config.js";
import { createPool } from "./db/pool.js";
import { createApp } from "./app.js";
import { shutdownInspectAdapter } from "./adapters/inspect.js";

async function main() {
  const config = loadConfig();
  const db = createPool(config.databaseUrl);
  const app = createApp(config, db);
  const port = config.nodeEnv === "production" ? config.port : config.apiPort;
  const server = app.listen(port, () => {
    console.log(
      JSON.stringify({
        event: "server_started",
        port,
        mode: config.nodeEnv,
        aiMode: config.aiMode,
        agentInspect: config.agentInspectEnabled,
      }),
    );
  });

  const shutdown = async (signal: string) => {
    console.log(JSON.stringify({ event: "server_shutdown", signal }));
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await shutdownInspectAdapter();
    await db.end().catch(() => undefined);
    process.exit(0);
  };
  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
