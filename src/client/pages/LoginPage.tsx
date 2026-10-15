import { useState } from "react";
import type { Coordinator, SessionInfo } from "../lib/coordinator";

export function LoginPage(props: {
  coordinator: Coordinator;
  onSignedIn: (session: SessionInfo) => void;
}) {
  const [email, setEmail] = useState("alex@northstar.demo");
  const [password, setPassword] = useState("Password123!");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await props.coordinator.login(email, password);
    setBusy(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    props.onSignedIn(res.data);
  }

  return (
    <div className="panel stack" style={{ maxWidth: 420 }}>
      <h1>Sign in</h1>
      <p className="muted">Synthetic demo accounts only. Example: alex@northstar.demo</p>
      <form className="stack" onSubmit={(e) => void onSubmit(e)}>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {error ? <p className="error" role="alert">{error}</p> : null}
        <button className="btn" type="submit" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
