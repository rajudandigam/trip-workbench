import { isNativeWebMcpAvailable } from "../lib/webmcp";
import type { SessionInfo } from "../lib/coordinator";

export function DiagnosticsPage(props: { session: SessionInfo | null }) {
  return (
    <div className="panel stack">
      <h1>Diagnostics</h1>
      <p className="muted">Development-only integration status. Not shown in production builds.</p>
      <ul>
        <li>Session: {props.session ? props.session.email : "signed out"}</li>
        <li>AI mode (client-reported capability): {props.session?.capabilities.aiMode ?? "n/a"}</li>
        <li>Native WebMCP (document.modelContext): {isNativeWebMcpAvailable() ? "present" : "absent"}</li>
        <li>
          Summarizer global: {typeof Summarizer === "undefined" ? "absent" : "present"}
        </li>
      </ul>
    </div>
  );
}
