import { defineConfig } from "cypress";
import { loadEnvFile } from "./scripts/load-env.js";

loadEnvFile();

export default defineConfig({
  e2e: {
    baseUrl: process.env.CYPRESS_baseUrl || "http://127.0.0.1:3000",
    supportFile: "cypress/support/e2e.ts",
    specPattern: "cypress/e2e/**/*.cy.ts",
    video: false,
  },
});
