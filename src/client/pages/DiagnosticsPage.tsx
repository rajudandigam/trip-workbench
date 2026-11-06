import { useEffect, useState } from "react";
import { isNativeWebMcpAvailable } from "../lib/webmcp";
import type { SessionInfo } from "../lib/coordinator";

export function DiagnosticsPage(props: { session: SessionInfo | null }) {
  const [health, setHealth] = useState<string>("checking…");
  const [now, setNow] = useState(() => new Date().toISOString());

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/health")
      .then(async (res) => {
        const body = (await res.json()) as {
          status?: string;
          database?: boolean;
          migrations?: boolean;
          aiMode?: string;
        };
        if (cancelled) return;
        setHealth(
          `${res.status} status=${body.status ?? "?"} database=${String(body.database)} migrations=${String(body.migrations)} aiMode=${body.aiMode ?? "?"}`,
        );
      })
      .catch((error: unknown) => {
        if (!cancelled) setHealth(`unreachable: ${(error as Error).message}`);
      });
    const timer = window.setInterval(() => setNow(new Date().toISOString()), 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  return (
    <div className="panel stack">
      <h1>Diagnostics</h1>
      <p className="muted">Development-only integration status. Not shown in production builds.</p>
      <ul data-testid="diagnostics-list">
        <li>Session: {props.session ? props.session.email : "signed out"}</li>
        <li>Role: {props.session?.role ?? "n/a"}</li>
        <li>AI mode (client-reported capability): {props.session?.capabilities.aiMode ?? "n/a"}</li>
        <li>
          Native WebMCP (document.modelContext):{" "}
          {isNativeWebMcpAvailable() ? "present" : "absent"}
        </li>
        <li>Summarizer global: {typeof Summarizer === "undefined" ? "absent" : "present"}</li>
        <li data-testid="diagnostics-health">Health: {health}</li>
        <li>Client clock sample: {now}</li>
      </ul>
      <p className="muted">
        Tool registration readiness is shown on the open draft editor. Submitted trips do not keep
        editing tools. Do not paste secrets here.
      </p>
    </div>
  );
}
