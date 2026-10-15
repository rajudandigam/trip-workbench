import { loadEnvFile } from "../scripts/load-env.js";

loadEnvFile();
process.env.DEMO_FIXED_NOW = process.env.DEMO_FIXED_NOW || "2026-10-14T19:00:00.000Z";
process.env.AI_MODE = process.env.AI_MODE || "fixture";
if (!process.env.DATABASE_URL && process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}
