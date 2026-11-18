/**
 * Native WebMCP smoke for Phase 1.
 *
 * When TW_CHROME_BIN points at a WebMCP-capable Chromium (Blink flag
 * WebMCPTesting), this script drives real page tools via puppeteer-core:
 * role-aware discovery, prepare_trip_review (no submit), and a recovered
 * update with exactly one PATCH plus independent SQL checks.
 *
 * Without a usable browser, it records blocked results honestly and does not
 * claim a pass. Model-directed journeys remain a separate not_run/blocked entry.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { strict as assert } from "node:assert";
import {
  informationalExitCode,
  overallFromSummary,
  strictEvidenceExitCode,
  summarizeResults,
} from "./webmcp/evidence-status.js";
import {
  isDirtyRefusal,
  isTripDraftGet,
  isTripPatch,
  observeNativeInvoke,
  type AppEnvelope,
  type NativeInvokeObservation,
} from "./webmcp/native-isolation.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, "../evals/evidence");
const blinkFlag = "--enable-blink-features=WebMCPTesting";
const strictMode =
  process.env.TW_WEBMCP_EVIDENCE_STRICT === "1" ||
  process.env.TW_WEBMCP_EVIDENCE_STRICT === "true";

type SmokeStatus = "pass" | "fail" | "blocked" | "not_run";

type SmokeResult = {
  id: string;
  layer: "native";
  status: SmokeStatus;
  reason?: string;
  assertions?: string[];
  setup?: string[];
  modelDirected?: boolean;
  /** Default true for native scripted cases; model cases are optional. */
  mandatory?: boolean;
};

function writeEvidence(payload: Record<string, unknown>) {
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(outDir, `native-smoke-${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify(payload, null, 2));
  return file;
}

function blockedResults(reason: string, setup: string[]): SmokeResult[] {
  return [
    {
      id: "NATIVE-TOOL-DISCOVERY",
      layer: "native",
      status: "blocked",
      reason,
      setup,
      modelDirected: false,
    },
    {
      id: "NATIVE-DIRTY-READ",
      layer: "native",
      status: "blocked",
      reason: "Depends on NATIVE-TOOL-DISCOVERY",
      modelDirected: false,
    },
    {
      id: "NATIVE-DIRTY-REFUSAL",
      layer: "native",
      status: "blocked",
      reason: "Depends on NATIVE-TOOL-DISCOVERY",
      modelDirected: false,
    },
    {
      id: "NATIVE-PREPARE-REVIEW",
      layer: "native",
      status: "blocked",
      reason: "Depends on NATIVE-TOOL-DISCOVERY",
      modelDirected: false,
    },
    {
      id: "NATIVE-RECHECK-UPDATE",
      layer: "native",
      status: "blocked",
      reason: "Depends on NATIVE-TOOL-DISCOVERY",
      modelDirected: false,
    },
    {
      id: "MODEL-AGENT-JOURNEYS",
      layer: "native",
      status: "blocked",
      modelDirected: true,
      mandatory: false,
      reason:
        "Model-directed WebMCP journeys were not run in this scripted smoke. Use Cursor or Inspector with discovered tools when available.",
      setup: [
        "Exact update then prepare_trip_review (×2)",
        "Ambiguous brief requiring clarification (×2)",
        "Premium-cabin request whose explanation distinguishes review from a blocker (×2)",
      ],
    },
  ];
}

function resolveChromeBin(): string | null {
  if (process.env.TW_CHROME_BIN && fs.existsSync(process.env.TW_CHROME_BIN)) {
    return process.env.TW_CHROME_BIN;
  }
  return null;
}

async function runBrowserSmoke(): Promise<{
  results: SmokeResult[];
  browser?: string;
  checks?: Record<string, unknown>;
}> {
  const chromeBin = resolveChromeBin();
  if (!chromeBin) {
    return {
      results: blockedResults(
        "TW_CHROME_BIN is unset or missing. Native WebMCP requires a WebMCP-capable Chromium binary.",
        [
          "Set TW_CHROME_BIN to a Chromium build that supports document.modelContext / page.webmcp",
          "Launch with --enable-blink-features=WebMCPTesting",
          "Ensure dist/client is built (NODE_ENV=production serves the SPA from the test app)",
          "Ensure TEST_DATABASE_URL points at a disposable database (or TW_ISOLATED_TEST_DB=1)",
        ],
      ),
    };
  }

  let puppeteer: typeof import("puppeteer-core");
  try {
    puppeteer = await import("puppeteer-core");
  } catch {
    return {
      results: blockedResults(
        "puppeteer-core is not installed. npm install puppeteer-core to enable the browser path.",
        ["npm install --save-dev puppeteer-core", "Set TW_CHROME_BIN", "Re-run npm run test:native-smoke"],
      ),
    };
  }

  const clientDir = path.resolve(__dirname, "../dist/client");
  if (!fs.existsSync(path.join(clientDir, "index.html"))) {
    return {
      results: blockedResults(
        "dist/client is missing. Build the client before the production native smoke path.",
        ["npm run build", "Set TW_CHROME_BIN", "Re-run npm run test:native-smoke"],
      ),
    };
  }

  process.env.AI_MODE = "disabled";
  process.env.NODE_ENV = "production";
  if (process.env.TW_ISOLATED_TEST_DB !== "1" && process.env.TEST_DATABASE_URL && process.env.DATABASE_URL) {
    // keep distinct URLs; startTestApp will refuse aliases without the flag
  }

  const { startTestApp } = await import(
    pathToFileURL(path.resolve(__dirname, "../tests/api/helpers.ts")).href
  );

  const app = await startTestApp();
  const flags = ["--disable-dev-shm-usage", "--disable-gpu", blinkFlag];
  if (process.env.TW_ISOLATED_NO_SANDBOX === "1") flags.push("--no-sandbox");

  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined;
  try {
    browser = await puppeteer.launch({
      executablePath: chromeBin,
      headless: true,
      args: flags,
    });
    const browserVersion = await browser.version();
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

    await page.goto(`${app.baseUrl}/login`);
    await page.waitForSelector("#email");
    await page.click('button[type=submit]');
    await page.waitForSelector("[data-testid=create-trip]");
    await page.click("[data-testid=create-trip]");
    await page.waitForSelector("[data-testid=saved-revision]");

    const draftId = new URL(page.url()).pathname.split("/").at(-1)!;

    type WebmcpPage = typeof page & {
      webmcp?: {
        tools: () => Array<{
          name: string;
          execute: (
            args: Record<string, unknown>,
            opts?: { signal?: AbortSignal },
          ) => Promise<{ status: string; output: unknown; errorText?: string }>;
        }>;
      };
    };
    const mcpPage = page as WebmcpPage;
    if (!mcpPage.webmcp?.tools) {
      return {
        results: blockedResults(
          `Browser ${browserVersion} launched but page.webmcp is unavailable. Need a WebMCP-capable Chromium with ${blinkFlag}.`,
          [
            "Use a Chromium build that exposes page.webmcp / document.modelContext",
            `Launch with ${blinkFlag}`,
            "Re-run npm run test:native-smoke",
          ],
        ),
        browser: browserVersion,
      };
    }

    await until(() => (mcpPage.webmcp?.tools().length ?? 0) === 5, "five native page tools");
    const travelerTools = mcpPage.webmcp.tools().map((t) => t.name).sort();
    assert.deepEqual(travelerTools, [
      "get_trip_draft",
      "prepare_trip_review",
      "recheck_trip_update",
      "update_trip_draft",
      "validate_trip_draft",
    ]);

    const tripRow = async () =>
      (
        await app.db.query(
          `SELECT revision, status, destination, purpose, cabin,
                  (SELECT count(*)::int FROM trip_submissions WHERE trip_id = $1) AS submissions
           FROM trip_drafts WHERE id = $1`,
          [draftId],
        )
      ).rows[0];

    const dom = async () =>
      page.evaluate(() => {
        const doc = (globalThis as unknown as { document: {
          querySelector: (sel: string) => { textContent?: string | null; value?: string } | null;
        } }).document;
        return {
          revision: doc.querySelector("[data-testid=saved-revision]")?.textContent,
          prepared: doc.querySelector("[data-testid=prepared-review]")?.textContent ?? null,
          localPurpose: doc.querySelector("#purpose")?.value,
          pending: !!doc.querySelector("[data-testid=pending-outcome]"),
        };
      });

    const parseEnvelope = (output: unknown): AppEnvelope | null => {
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
    };

    const invoke = async (
      name: string,
      args: Record<string, unknown>,
    ): Promise<{ envelope: AppEnvelope; observation: NativeInvokeObservation }> => {
      const tool = mcpPage.webmcp!.tools().find((t) => t.name === name);
      assert.ok(tool, `missing tool ${name}`);
      const call = await tool.execute(args, { signal: AbortSignal.timeout(8000) });
      const envelope = parseEnvelope(call.output);
      const observation = observeNativeInvoke(name, call, envelope);
      if (!envelope) {
        throw new Error(
          `${name} has no app envelope: ${JSON.stringify({
            output: call.output,
            status: call.status,
            nativeStatus: observation.nativeStatus,
          }).slice(0, 300)}`,
        );
      }
      return { envelope, observation };
    };

    // Dirty-read with a deterministic CDP barrier on the real draft GET:
    // pause the request, apply the during-read edit, then continue.
    const beforeReadEdit = "local-edit-before-get";
    await page.locator("#purpose").fill(beforeReadEdit);
    await until(async () => (await dom()).localPurpose === beforeReadEdit, "pre-read local edit");
    assert.equal((await tripRow()).purpose, "");

    const duringReadEdit = "local-edit-during-get";
    let draftGetPaused = 0;
    const readBarrier = await page.createCDPSession();
    await readBarrier.send("Fetch.enable", {
      patterns: [{ urlPattern: "*/api/trips/*", requestStage: "Request" }],
    });
    const barrierHandler = async (ev: {
      requestId: string;
      request: { method: string; url: string };
    }) => {
      try {
        if (isTripDraftGet(ev.request.url, draftId, ev.request.method)) {
          draftGetPaused += 1;
          await page.locator("#purpose").fill(duringReadEdit);
          await until(
            async () => (await dom()).localPurpose === duringReadEdit,
            "during-read edit applied while GET paused",
          );
        }
      } finally {
        await readBarrier.send("Fetch.continueRequest", { requestId: ev.requestId });
      }
    };
    readBarrier.on("Fetch.requestPaused", barrierHandler);

    try {
      const { envelope: got, observation: getObs } = await invoke("get_trip_draft", {
        draftId,
      });
      assert.equal(got.ok, true);
      assert.equal((got.data as { revision: number }).revision, 1);
      assert.ok(draftGetPaused >= 1, "draft GET must pause at least once");
      await until(async () => (await dom()).localPurpose === duringReadEdit, "during-read local edit");
      assert.equal((await tripRow()).purpose, "");
      assert.equal((await tripRow()).revision, 1);
      assert.ok(getObs.nativeStatus === "success" || getObs.nativeStatus === "unknown");
    } finally {
      readBarrier.off("Fetch.requestPaused", barrierHandler);
      await readBarrier.send("Fetch.disable").catch(() => undefined);
      await readBarrier.detach().catch(() => undefined);
    }

    // Negative: while still dirty, update_trip_draft must refuse with zero PATCH.
    let refusalPatches = 0;
    const refusalCdp = await page.createCDPSession();
    await refusalCdp.send("Fetch.enable", {
      patterns: [{ urlPattern: "*/api/trips/*", requestStage: "Request" }],
    });
    const refusalHandler = async (ev: {
      requestId: string;
      request: { method: string; url: string };
    }) => {
      try {
        if (isTripPatch(ev.request.url, draftId, ev.request.method)) {
          refusalPatches += 1;
        }
      } finally {
        await refusalCdp.send("Fetch.continueRequest", { requestId: ev.requestId });
      }
    };
    refusalCdp.on("Fetch.requestPaused", refusalHandler);

    let dirtyRefusalObs: NativeInvokeObservation;
    try {
      const refused = await invoke("update_trip_draft", {
        draftId,
        expectedRevision: 1,
        commandId: "smoke-dirty-refusal",
        patch: { destination: "SFO" },
      });
      dirtyRefusalObs = refused.observation;
      assert.ok(isDirtyRefusal(refused.observation), "expected USER_EDIT_IN_PROGRESS");
      assert.equal(refusalPatches, 0, "dirty refusal must issue zero PATCH requests");
      assert.equal((await tripRow()).revision, 1);
      assert.equal((await tripRow()).destination, "");
    } finally {
      refusalCdp.off("Fetch.requestPaused", refusalHandler);
      await refusalCdp.send("Fetch.disable").catch(() => undefined);
      await refusalCdp.detach().catch(() => undefined);
    }

    // Isolate dirty-read from later mutations: discard local edits first.
    await page.click("[data-testid=discard-changes]");
    await until(async () => (await dom()).localPurpose === "", "discarded local purpose");
    assert.equal((await tripRow()).revision, 1);

    const { envelope: normal } = await invoke("update_trip_draft", {
      draftId,
      expectedRevision: 1,
      commandId: "smoke-first-update",
      patch: {
        destination: "JFK",
        departureDate: "2026-11-12",
        returnDate: "2026-11-15",
        cabin: "business",
        purpose: "Customer workshop",
      },
    });
    assert.equal(normal.ok, true);
    assert.equal((await tripRow()).revision, 2);

    const { envelope: prep } = await invoke("prepare_trip_review", {
      draftId,
      expectedRevision: 2,
    });
    assert.equal(prep.ok, true);
    assert.equal((prep.data as { submitted: boolean }).submitted, false);
    await page.waitForSelector("[data-testid=prepared-review]", { visible: true });
    const reviewDOM = await dom();
    const reviewDB = await tripRow();
    assert.ok(reviewDOM.prepared?.includes("canSubmit=true") || reviewDOM.prepared?.includes("canSubmit"));
    assert.equal(reviewDB.status, "draft");
    assert.equal(Number(reviewDB.submissions), 0);

    const sid = "smoke-lost-response";
    let hideReceipts = true;
    let patchRequests = 0;
    let droppedStatus: number | null = null;
    let hiddenReceipts = 0;
    let restoredReceipts = 0;
    const cdp = await page.createCDPSession();
    await cdp.send("Fetch.enable", {
      patterns: [{ urlPattern: "*/api/trips/*", requestStage: "Response" }],
    });
    cdp.on("Fetch.requestPaused", async (ev: {
      requestId: string;
      request: { method: string; url: string; postData?: string };
      responseStatusCode?: number;
    }) => {
      const req = ev.request;
      if (req.method === "PATCH" && req.postData?.includes(sid)) {
        patchRequests += 1;
        droppedStatus = ev.responseStatusCode ?? null;
        await cdp.send("Fetch.failRequest", { requestId: ev.requestId, errorReason: "Failed" });
        return;
      }
      if (req.method === "GET" && req.url.endsWith(`/commands/${sid}`)) {
        if (hideReceipts) {
          hiddenReceipts += 1;
          await cdp.send("Fetch.fulfillRequest", {
            requestId: ev.requestId,
            responseCode: 404,
            responseHeaders: [{ name: "Content-Type", value: "application/json" }],
            body: Buffer.from(
              JSON.stringify({
                ok: false,
                error: { code: "NOT_FOUND", message: "Temporarily hidden by smoke harness" },
              }),
            ).toString("base64"),
          });
          return;
        }
        restoredReceipts += 1;
      }
      await cdp.send("Fetch.continueRequest", { requestId: ev.requestId });
    });

    const { envelope: lost } = await invoke("update_trip_draft", {
      draftId,
      expectedRevision: 2,
      commandId: sid,
      patch: { destination: "BOS" },
    });
    assert.equal(lost.error?.code, "OUTCOME_UNKNOWN");
    await page.waitForSelector("[data-testid=pending-outcome]", { visible: true });
    assert.equal((await tripRow()).revision, 3);
    assert.equal((await tripRow()).destination, "BOS");

    const localNote = "Human edit while the receipt was pending";
    await page.locator("#purpose").fill(localNote);
    await until(async () => (await dom()).localPurpose === localNote, "manual edit visible");

    hideReceipts = false;
    const { envelope: rechecked } = await invoke("recheck_trip_update", {
      draftId,
      commandId: sid,
    });
    assert.equal(rechecked.ok, true);
    await until(
      async () => Number((await dom()).revision) === 3 && !(await dom()).pending,
      "recovery reflected",
    );

    const after = await dom();
    const dbAfter = await tripRow();
    const matchCount = (
      await app.db.query(`SELECT count(*)::int AS count FROM command_receipts WHERE command_id = $1`, [
        sid,
      ])
    ).rows[0].count;
    assert.equal(patchRequests, 1);
    assert.equal(droppedStatus, 200);
    assert.ok(hiddenReceipts > 0 && restoredReceipts > 0);
    assert.equal(Number(matchCount), 1);
    assert.equal(dbAfter.status, "draft");
    assert.equal(dbAfter.destination, "BOS");
    assert.equal(dbAfter.purpose, "Customer workshop");
    assert.equal(after.localPurpose, localNote);
    assert.equal(Number(dbAfter.submissions), 0);
    await cdp.send("Fetch.disable");
    await cdp.detach();

    const observerContext = await browser.createBrowserContext();
    const observer = await observerContext.newPage();
    observer.setDefaultTimeout(10_000);
    await observer.goto(`${app.baseUrl}/login`);
    await observer.waitForSelector("#email");
    await observer.locator("#email").fill("observer@northstar.demo");
    await observer.click('button[type=submit]');
    await observer.waitForSelector("[data-testid=trip-list]");
    await observer.click(`[data-testid="trip-link-${draftId}"]`);
    const obsPage = observer as WebmcpPage;
    await until(() => (obsPage.webmcp?.tools().length ?? 0) === 3, "three observer tools");
    const observerTools = obsPage.webmcp!.tools().map((t) => t.name).sort();
    assert.deepEqual(observerTools, [
      "get_trip_draft",
      "prepare_trip_review",
      "validate_trip_draft",
    ]);
    await observer.click('a[href="/trips"]');
    await until(() => (obsPage.webmcp?.tools().length ?? 0) === 0, "tools removed off editor");
    await observerContext.close();

    const results: SmokeResult[] = [
      {
        id: "NATIVE-TOOL-DISCOVERY",
        layer: "native",
        status: "pass",
        modelDirected: false,
        assertions: [
          `traveler tools: ${travelerTools.join(", ")}`,
          `observer tools: ${observerTools.join(", ")}`,
          `browser: ${browserVersion}`,
        ],
      },
      {
        id: "NATIVE-DIRTY-READ",
        layer: "native",
        status: "pass",
        modelDirected: false,
        mandatory: true,
        assertions: [
          "unsaved edit before get_trip_draft",
          "deterministic edit during paused draft GET",
          "saved DB purpose unchanged",
          "get_trip_draft returned revision 1",
          `draftGetPaused=${draftGetPaused}`,
        ],
      },
      {
        id: "NATIVE-DIRTY-REFUSAL",
        layer: "native",
        status: "pass",
        modelDirected: false,
        mandatory: true,
        assertions: [
          "USER_EDIT_IN_PROGRESS while dirty",
          "zero PATCH requests during refusal",
          `nativeStatus=${dirtyRefusalObs.nativeStatus}`,
          `errorCode=${dirtyRefusalObs.errorCode}`,
          "discard-changes before subsequent mutation",
        ],
      },
      {
        id: "NATIVE-PREPARE-REVIEW",
        layer: "native",
        status: "pass",
        modelDirected: false,
        assertions: [
          "prepared panel visible",
          "submitted=false",
          "db status=draft submissions=0",
        ],
      },
      {
        id: "NATIVE-RECHECK-UPDATE",
        layer: "native",
        status: "pass",
        modelDirected: false,
        assertions: [
          "exactly one PATCH",
          "one matching receipt",
          "BOS persisted",
          "human purpose edit kept locally",
        ],
      },
      {
        id: "MODEL-AGENT-JOURNEYS",
        layer: "native",
        status: "not_run",
        modelDirected: true,
        reason:
          "Scripted native smoke does not exercise model-directed tool choice. Run exact-update, ambiguous-request, and premium-cabin prompts separately through Cursor.",
      },
    ];

    return {
      results,
      browser: browserVersion,
      checks: {
        draftId,
        travelerTools,
        observerTools,
        dirtyRead: { draftGetPaused, duringReadEdit },
        dirtyRefusal: dirtyRefusalObs,
        preparedReview: { dom: reviewDOM, db: reviewDB },
        recovered: {
          patchRequests,
          droppedStatus,
          matchingReceipts: matchCount,
          db: dbAfter,
          localPurpose: after.localPurpose,
        },
      },
    };
  } finally {
    if (browser) await browser.close().catch(() => undefined);
    await app.close();
  }
}

async function main() {
  let commit = "unknown";
  try {
    commit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    /* ignore */
  }

  let run: { results: SmokeResult[]; browser?: string; checks?: Record<string, unknown> };
  try {
    run = await runBrowserSmoke();
  } catch (error) {
    run = {
      results: [
        ...blockedResults((error as Error).message || "Native smoke failed before completion.", [
          "Inspect the error",
          "Confirm TW_CHROME_BIN and TEST_DATABASE_URL",
        ]).slice(0, 4).map((r) =>
          r.id === "NATIVE-TOOL-DISCOVERY"
            ? { ...r, status: "fail" as const, reason: (error as Error).message }
            : r,
        ),
        {
          id: "MODEL-AGENT-JOURNEYS",
          layer: "native",
          status: "not_run",
          modelDirected: true,
          reason: "Not attempted because scripted native smoke failed.",
        },
      ],
    };
  }

  const annotated = run.results.map((r) => ({
    ...r,
    mandatory: r.modelDirected ? false : r.mandatory !== false,
  }));
  const summary = summarizeResults(annotated);
  const overall = overallFromSummary(summary);
  const strict = strictEvidenceExitCode(annotated);
  const exitCode = strictMode ? strict.code : informationalExitCode(overall);

  const file = writeEvidence({
    generatedAt: new Date().toISOString(),
    commit,
    host: process.platform,
    node: process.version,
    browser: run.browser ?? null,
    modelDirected: false,
    strictMode,
    note: strictMode
      ? "Strict WebMCP evidence gate: exit 0 only when every mandatory native case ran and passed; exit 2 if blocked."
      : "Informational native smoke: blocked/not_run without failures still exits 0. Use npm run test:webmcp-evidence for the CI gate.",
    checks: run.checks ?? null,
    results: annotated,
    summary,
    status: overall,
    strict,
  });

  console.log(
    JSON.stringify(
      {
        ok: exitCode === 0,
        status: overall,
        strictMode,
        exitCode,
        strict,
        evidence: file,
        summary,
      },
      null,
      2,
    ),
  );
  process.exitCode = exitCode;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
