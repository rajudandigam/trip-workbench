/**
 * Native UI-synchronization evidence matrix.
 *
 * Declares expected timing/visible fields before each case. Records
 * observeOutcome facts at the operation deadline and again after repair.
 * When Chrome / WebMCP is unavailable, cases are NOT RUN — never claimed pass.
 *
 * Execution label: native (or not_run when blocked).
 */
import "../load-env.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createInspector } from "agent-inspect";
import { bufferedFileWriter } from "agent-inspect/writers";
import {
  evaluateUiSyncAtDeadline,
  type SyncFact,
  type UiSyncExpectation,
} from "./ui-sync-observer.js";
import {
  isDirtyRefusal,
  isTripPatch,
  observeNativeInvoke,
  type AppEnvelope,
} from "./native-isolation.js";
import {
  EXPECTED_UI_SYNC_CASE_IDS,
  finalizeUiSyncMatrix,
  type UiSyncCaseId,
  type UiSyncCaseReport,
} from "./ui-sync-finalize.js";
import {
  expectedFinalDomForCase,
  runPersistedCliEvidence,
  scoreCaseAbc,
  type CaseAbcReport,
} from "./ui-sync-comparison.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const blinkFlag = "--enable-blink-features=WebMCPTesting";

type CaseReport = UiSyncCaseReport & {
  deadlineFacts?: SyncFact[];
  repairFacts?: SyncFact[];
  assertions?: string[];
  finalDomFields?: Record<string, string>;
};

function resolveChromeBin(): string | null {
  if (process.env.TW_CHROME_BIN && fs.existsSync(process.env.TW_CHROME_BIN)) {
    return process.env.TW_CHROME_BIN;
  }
  return null;
}

function parseEnvelope(output: unknown): AppEnvelope | null {
  let val: unknown = output;
  for (let i = 0; i < 5; i++) {
    if (typeof val === "string") {
      try {
        val = JSON.parse(val);
        continue;
      } catch {
        break;
      }
    }
    const asObj = val as { content?: Array<{ text?: string }> } | Array<{ text?: string }> | null;
    if (asObj && !Array.isArray(asObj) && asObj.content?.[0]?.text) {
      val = asObj.content[0].text;
      continue;
    }
    if (Array.isArray(asObj) && asObj[0]?.text) {
      val = asObj[0].text;
      continue;
    }
    break;
  }
  const envelope = val as AppEnvelope;
  return typeof envelope?.ok === "boolean" ? envelope : null;
}

async function main() {
  const outRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tw-ui-sync-"));
  const traceDir = path.join(outRoot, "traces");
  fs.mkdirSync(traceDir, { recursive: true });

  const chromeBin = resolveChromeBin();
  const clientDir = path.resolve(__dirname, "../../dist/client");
  const hasClient = fs.existsSync(path.join(clientDir, "index.html"));

  if (!chromeBin || !hasClient) {
    const reason = !chromeBin
      ? "TW_CHROME_BIN unset/missing — native UI-sync not run"
      : "dist/client missing — build before native UI-sync";
    const matrix = finalizeUiSyncMatrix({
      reported: EXPECTED_UI_SYNC_CASE_IDS.map((id) => ({
        id,
        status: "not_run" as const,
        reason,
      })),
    });
    const abc: CaseAbcReport[] = matrix.cases.map((c) =>
      scoreCaseAbc({
        caseId: c.id,
        fixtureStatus: c.status,
        outcomes: [],
        evidenceVerified: null,
      }),
    );
    const report = {
      ok: matrix.ok,
      execution: "native",
      native: matrix.native,
      note: "Do not claim UI-sync success. Re-run with TW_CHROME_BIN + npm run build.",
      cases: matrix.cases,
      abc,
      lanes: {
        A: "final_dom",
        B: "per_op_deadline_repair",
        C: "persisted_cli_evidence",
      },
      outRoot,
    };
    const reportPath = path.join(outRoot, "ui-sync-report.json");
    fs.writeFileSync(reportPath, JSON.stringify({ ...report, reportPath }, null, 2));
    console.log(JSON.stringify({ ...report, reportPath }, null, 2));
    process.exitCode = matrix.exitCode;
    return;
  }

  let puppeteer: typeof import("puppeteer-core");
  try {
    puppeteer = await import("puppeteer-core");
  } catch {
    const matrix = finalizeUiSyncMatrix({
      reported: EXPECTED_UI_SYNC_CASE_IDS.map((id) => ({
        id,
        status: "blocked" as const,
        reason: "puppeteer-core missing",
      })),
    });
    const abc: CaseAbcReport[] = matrix.cases.map((c) =>
      scoreCaseAbc({
        caseId: c.id,
        fixtureStatus: c.status,
        outcomes: [],
        evidenceVerified: null,
      }),
    );
    const report = {
      ok: matrix.ok,
      execution: "native",
      native: matrix.native,
      note: "puppeteer-core missing",
      cases: matrix.cases,
      abc,
      lanes: {
        A: "final_dom",
        B: "per_op_deadline_repair",
        C: "persisted_cli_evidence",
      },
      outRoot,
    };
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = matrix.exitCode;
    return;
  }

  process.env.AI_MODE = process.env.AI_MODE || "disabled";
  process.env.NODE_ENV = "production";
  const { startTestApp } = await import(
    pathToFileURL(path.resolve(__dirname, "../../tests/api/helpers.ts")).href
  );
  const app = await startTestApp();
  const writer = bufferedFileWriter({ dir: traceDir, flushIntervalMs: 50 });
  const inspector = createInspector({
    enabled: true,
    writer,
    traceDir,
    silent: true,
    capture: { onSuccess: "none", onError: "none" },
  });

  const flags = ["--disable-dev-shm-usage", "--disable-gpu", blinkFlag];
  if (process.env.TW_ISOLATED_NO_SANDBOX === "1") flags.push("--no-sandbox");

  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined;
  const cases: CaseReport[] = [];
  let activeCaseId: UiSyncCaseId | null = null;
  let fatalError: string | null = null;
  let finalizationError: string | null = null;

  try {
    browser = await puppeteer.launch({
      executablePath: chromeBin,
      headless: true,
      args: flags,
    });
    const page = await browser.newPage();
    page.setDefaultTimeout(10_000);
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    async function until(fn: () => Promise<boolean> | boolean, msg: string) {
      const end = Date.now() + 8000;
      do {
        if (await fn()) return;
        await wait(40);
      } while (Date.now() < end);
      throw new Error(`Timed out: ${msg}`);
    }

    type WebmcpPage = typeof page & {
      webmcp?: {
        tools: () => Array<{
          name: string;
          execute: (
            args: Record<string, unknown>,
            opts?: { signal?: AbortSignal },
          ) => Promise<{ status: string; output: unknown }>;
        }>;
      };
    };
    const mcpPage = page as WebmcpPage;

    await page.goto(`${app.baseUrl}/login`);
    await page.waitForSelector("#email");
    await page.click('button[type=submit]');
    await page.waitForSelector("[data-testid=create-trip]");
    await page.click("[data-testid=create-trip]");
    await page.waitForSelector("[data-testid=saved-revision]");
    const draftId = new URL(page.url()).pathname.split("/").at(-1)!;

    if (!mcpPage.webmcp?.tools) {
      const reason = "page.webmcp unavailable";
      for (const id of EXPECTED_UI_SYNC_CASE_IDS) {
        cases.push({ id, status: "blocked", reason });
      }
      throw new Error(reason);
    }
    await until(() => (mcpPage.webmcp?.tools().length ?? 0) >= 4, "tools ready");

    const invoke = async (name: string, args: Record<string, unknown>) => {
      const tool = mcpPage.webmcp!.tools().find((t) => t.name === name);
      if (!tool) throw new Error(`missing tool ${name}`);
      const call = await tool.execute(args, { signal: AbortSignal.timeout(8000) });
      const envelope = parseEnvelope(call.output);
      const observation = observeNativeInvoke(name, call, envelope);
      if (!envelope) {
        throw new Error(`${name} missing envelope (native=${observation.nativeStatus})`);
      }
      return { envelope, observation };
    };

    const tripRow = async (id = draftId) =>
      (
        await app.db.query(
          `SELECT id, revision, destination, purpose FROM trip_drafts WHERE id = $1`,
          [id],
        )
      ).rows[0] as {
        id: string;
        revision: number;
        destination: string;
        purpose: string;
      };

    const readDom = async () =>
      page.evaluate(() => {
        const doc = (globalThis as unknown as {
          document: {
            querySelector: (sel: string) => { value?: string; textContent?: string | null } | null;
          };
        }).document;
        return {
          destination: doc.querySelector("#destination")?.value ?? "",
          purpose: doc.querySelector("#purpose")?.value ?? "",
          revision: doc.querySelector("[data-testid=saved-revision]")?.textContent ?? "",
        };
      });

    const recordFacts = async (facts: SyncFact[], prefix: string) => {
      for (const fact of facts) {
        await inspector.observeOutcome(`${prefix}.${fact.name}`, {
          expectation: fact.name,
          status: fact.verdict,
          method: fact.method,
          evidence: {
            ...fact.evidence,
            phase: fact.phase,
            execution: "native",
            ...(fact.reason ? { reason: fact.reason } : {}),
          },
        });
      }
    };

    // Seed a known revision-2 draft for subsequent cases.
    await inspector.run("ui-sync-seed", async () => {
      const { envelope } = await invoke("update_trip_draft", {
        draftId,
        expectedRevision: 1,
        commandId: "ui-sync-seed",
        patch: {
          destination: "JFK",
          departureDate: "2026-11-12",
          returnDate: "2026-11-15",
          cabin: "business",
          purpose: "Customer workshop",
        },
      });
      if (!envelope.ok) throw new Error("seed update failed");
      await until(async () => (await tripRow()).revision === 2, "seed revision 2");
    });

    // --- healthy-update ---
    activeCaseId = "healthy-update";
    await inspector.run("ui-sync-healthy-update", async () => {
      const expectation: UiSyncExpectation = {
        resourceId: draftId,
        expectedDomFields: { destination: "BOS" },
        expectedSavedFields: { destination: "BOS" },
        expectedRevision: 3,
      };
      const { envelope } = await invoke("update_trip_draft", {
        draftId,
        expectedRevision: 2,
        commandId: "ui-sync-healthy",
        patch: { destination: "BOS" },
      });
      if (!envelope.ok) throw new Error("healthy update failed");
      await until(async () => (await tripRow()).destination === "BOS", "db BOS");
      await until(async () => (await readDom()).destination === "BOS", "dom BOS");
      const row = await tripRow();
      const dom = await readDom();
      const deadlineFacts = evaluateUiSyncAtDeadline(expectation, {
        resourceId: row.id,
        domFields: { destination: dom.destination },
        savedFields: { destination: row.destination },
        savedRevision: row.revision,
        observerPresent: true,
      });
      await recordFacts(deadlineFacts, "healthy.deadline");
      const ok = deadlineFacts.every((f) => f.verdict === "passed");
      cases.push({
        id: "healthy-update",
        status: ok ? "pass" : "fail",
        deadlineFacts,
        finalDomFields: { destination: dom.destination },
        assertions: ["DOM+DB match at operation deadline"],
      });
    });

    // Reset destination for remaining cases (revision now 3).
    // --- stale-ui-then-repair (injected DOM mismatch after commit) ---
    activeCaseId = "stale-ui-then-repair";
    // Declared before mutation: observation budget and expected fields.
    const STALE_EXPECTED_DOM = { destination: "SFO" } as const;
    const STALE_EXPECTED_SAVED = { destination: "SFO" } as const;
    const STALE_EXPECTED_REVISION = 4;
    const STALE_OBSERVATION_BUDGET_MS = 8000;
    await inspector.run("ui-sync-stale-then-repair", async () => {
      // Move to SFO so we can inject a visible-field mismatch after commit.
      const { envelope } = await invoke("update_trip_draft", {
        draftId,
        expectedRevision: 3,
        commandId: "ui-sync-stale-write",
        patch: { destination: "SFO" },
      });
      if (!envelope.ok) throw new Error("stale-case write failed");
      await until(async () => (await tripRow()).destination === "SFO", "db SFO");

      // Injected DOM mismatch (test-only): rewrite input .value after the server
      // commit. This is not a reproduced React/cache-invalidation path.
      await page.evaluate(() => {
        const el = (globalThis as unknown as {
          document: { querySelector: (s: string) => { value: string } | null };
        }).document.querySelector("#destination");
        if (el) el.value = "BOS";
      });

      const expectation: UiSyncExpectation = {
        resourceId: draftId,
        expectedDomFields: { ...STALE_EXPECTED_DOM },
        expectedSavedFields: { ...STALE_EXPECTED_SAVED },
        expectedRevision: STALE_EXPECTED_REVISION,
      };
      const row = await tripRow();
      const dom = await readDom();
      const deadlineFacts = evaluateUiSyncAtDeadline(expectation, {
        resourceId: row.id,
        domFields: { destination: dom.destination },
        savedFields: { destination: row.destination },
        savedRevision: row.revision,
        observerPresent: true,
      });
      await recordFacts(deadlineFacts, "stale.deadline");

      // Repair: discard/re-read via get_trip_draft (or reload).
      await invoke("get_trip_draft", { draftId });
      await until(async () => (await readDom()).destination === "SFO", "repair DOM");
      const row2 = await tripRow();
      const dom2 = await readDom();
      const repairFacts = evaluateUiSyncAtDeadline(
        expectation,
        {
          resourceId: row2.id,
          domFields: { destination: dom2.destination },
          savedFields: { destination: row2.destination },
          savedRevision: row2.revision,
          observerPresent: true,
        },
        "after_repair",
      );
      await recordFacts(repairFacts, "stale.repair");

      const deadlineFailed = deadlineFacts.some(
        (f) => f.name === "ui_matches_saved" && f.verdict === "failed",
      );
      const repairOk = repairFacts.every((f) => f.verdict === "passed");
      cases.push({
        id: "stale-ui-then-repair",
        status: deadlineFailed && repairOk ? "pass" : "fail",
        deadlineFacts,
        repairFacts,
        finalDomFields: { destination: dom2.destination },
        assertions: [
          "injected DOM mismatch at deadline while DB committed",
          "after repair DOM matches; original deadline failure retained in trace",
          `observationBudgetMs=${STALE_OBSERVATION_BUDGET_MS}`,
          "injection: synthetic DOM .value rewrite (not React/cache-invalidation)",
        ],
      });
    });

    // --- missing-observer (synthetic control inside native harness) ---
    activeCaseId = "missing-observer";
    await inspector.run("ui-sync-missing-observer", async () => {
      const expectation: UiSyncExpectation = {
        resourceId: draftId,
        expectedDomFields: { destination: "SFO" },
        expectedSavedFields: { destination: "SFO" },
        expectedRevision: 4,
      };
      const deadlineFacts = evaluateUiSyncAtDeadline(expectation, {
        observerPresent: false,
      });
      await recordFacts(deadlineFacts, "missing.deadline");
      const ok = deadlineFacts.every((f) => f.verdict === "unknown");
      cases.push({
        id: "missing-observer",
        status: ok ? "pass" : "fail",
        deadlineFacts,
        assertions: ["synthetic missing observer → unknown/nonpass"],
      });
    });

    // --- wrong-resource (synthetic control inside native harness) ---
    activeCaseId = "wrong-resource";
    await inspector.run("ui-sync-wrong-resource", async () => {
      const expectation: UiSyncExpectation = {
        resourceId: draftId,
        expectedDomFields: { destination: "SFO" },
        expectedSavedFields: { destination: "SFO" },
        expectedRevision: 4,
      };
      const row = await tripRow();
      const dom = await readDom();
      const deadlineFacts = evaluateUiSyncAtDeadline(expectation, {
        resourceId: "other-resource-id",
        domFields: { destination: dom.destination },
        savedFields: { destination: row.destination },
        savedRevision: row.revision,
        observerPresent: true,
      });
      await recordFacts(deadlineFacts, "wrong.deadline");
      const bindingFailed =
        deadlineFacts.find((f) => f.name === "resource_binding")?.verdict === "failed";
      cases.push({
        id: "wrong-resource",
        status: bindingFailed ? "pass" : "fail",
        deadlineFacts,
        assertions: ["synthetic wrong resource → binding fail"],
      });
    });

    // --- dirty-refusal ---
    activeCaseId = "dirty-refusal";
    await inspector.run("ui-sync-dirty-refusal", async () => {
      await page.locator("#purpose").fill("human-edit-for-refusal");
      await until(
        async () => (await readDom()).purpose === "human-edit-for-refusal",
        "dirty purpose",
      );
      let patchCount = 0;
      const cdp = await page.createCDPSession();
      await cdp.send("Fetch.enable", {
        patterns: [{ urlPattern: "*/api/trips/*", requestStage: "Request" }],
      });
      const handler = async (ev: {
        requestId: string;
        request: { method: string; url: string };
      }) => {
        try {
          if (isTripPatch(ev.request.url, draftId, ev.request.method)) patchCount += 1;
        } finally {
          await cdp.send("Fetch.continueRequest", { requestId: ev.requestId });
        }
      };
      cdp.on("Fetch.requestPaused", handler);
      try {
        const before = await tripRow();
        const refused = await invoke("update_trip_draft", {
          draftId,
          expectedRevision: before.revision,
          commandId: "ui-sync-dirty-refusal",
          patch: { destination: "LAX" },
        });
        const expectation: UiSyncExpectation = {
          resourceId: draftId,
          expectedDomFields: { destination: before.destination },
          expectedSavedFields: { destination: before.destination },
          expectedRevision: before.revision,
          expectRefusal: true,
          expectedErrorCode: "USER_EDIT_IN_PROGRESS",
        };
        const deadlineFacts = evaluateUiSyncAtDeadline(expectation, {
          resourceId: draftId,
          appOk: refused.envelope.ok === true,
          errorCode: refused.envelope.error?.code ?? null,
          patchCount,
          savedRevision: (await tripRow()).revision,
          observerPresent: true,
        });
        await recordFacts(deadlineFacts, "refusal.deadline");
        const ok =
          isDirtyRefusal(refused.observation) &&
          patchCount === 0 &&
          deadlineFacts.every((f) => f.verdict === "passed");
        const domAfter = await readDom();
        cases.push({
          id: "dirty-refusal",
          status: ok ? "pass" : "fail",
          deadlineFacts,
          finalDomFields: { destination: domAfter.destination },
          assertions: ["dirty refusal → USER_EDIT_IN_PROGRESS + zero PATCH"],
        });
        await page.click("[data-testid=discard-changes]");
      } finally {
        cdp.off("Fetch.requestPaused", handler);
        await cdp.send("Fetch.disable").catch(() => undefined);
        await cdp.detach().catch(() => undefined);
      }
    });
    activeCaseId = null;
  } catch (error) {
    fatalError = (error as Error).message || "ui-sync failed";
  } finally {
    try {
      await inspector.flush();
      await inspector.close();
    } catch (error) {
      finalizationError =
        (error as Error).message || "inspector flush/close failed";
    }
    if (browser) await browser.close().catch(() => undefined);
    await app.close();
  }

  const matrix = finalizeUiSyncMatrix({
    reported: cases,
    activeCaseId,
    fatalError,
    finalizationError,
    incompleteReason: fatalError ?? undefined,
  });

  // Lane C: score from disk after flush/close — not from in-memory observeOutcome args.
  const evidenceDir = path.join(outRoot, "evidence");
  const persisted =
    matrix.native === "not_run"
      ? null
      : runPersistedCliEvidence({
          traceDir,
          evidenceDir,
        });
  const evidenceVerified =
    persisted && !persisted.missingArtifact
      ? persisted.verifyExit === 0
      : matrix.native === "not_run"
        ? null
        : false;
  const reportedById = new Map(cases.map((c) => [c.id, c]));
  const abc: CaseAbcReport[] = matrix.cases.map((c) => {
    const reported = reportedById.get(c.id);
    return scoreCaseAbc({
      caseId: c.id,
      fixtureStatus: c.status,
      deadlineFacts: reported?.deadlineFacts,
      repairFacts: reported?.repairFacts,
      finalDomFields: reported?.finalDomFields ?? null,
      expectedFinalDomFields: expectedFinalDomForCase(c.id),
      outcomes: persisted?.outcomes ?? [],
      evidenceVerified,
      missingArtifact: persisted?.missingArtifact === true,
    });
  });

  const report = {
    ok: matrix.ok,
    execution: "native",
    native: matrix.native,
    note: matrix.note,
    fatalError: matrix.fatalError,
    finalizationError: matrix.finalizationError,
    cases: matrix.cases,
    abc,
    lanes: {
      A: "final_dom",
      B: "per_op_deadline_repair",
      C: "persisted_cli_evidence",
      note: "Lane A may miss pre-repair injected mismatch; B/C retain deadline failure.",
    },
    persistedEvidence: persisted
      ? {
          traceFile: persisted.traceFile,
          evidenceDir: persisted.evidenceDir,
          checkExit: persisted.checkExit,
          verifyExit: persisted.verifyExit,
          missingArtifact: persisted.missingArtifact,
          // Nonzero check is expected when the matrix includes failed/unknown
          // observations; fixture pass for those cases requires the named
          // observation to explain the finding (see lane C per case).
          checkStdout: persisted.checkStdout.slice(0, 1500),
          verifyStdout: persisted.verifyStdout.slice(0, 800),
        }
      : null,
    outRoot,
    traceDir,
  };
  const reportPath = path.join(outRoot, "ui-sync-report.json");
  fs.writeFileSync(reportPath, JSON.stringify({ ...report, reportPath }, null, 2));
  console.log(JSON.stringify({ ...report, reportPath }, null, 2));
  process.exitCode = matrix.exitCode;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
