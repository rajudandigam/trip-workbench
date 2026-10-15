import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { createCoordinator, type SessionInfo } from "./lib/coordinator";
import { LoginPage } from "./pages/LoginPage";
import { TripsPage } from "./pages/TripsPage";
import { TripEditorPage } from "./pages/TripEditorPage";
import { TripReviewPage } from "./pages/TripReviewPage";
import { TripConfirmationPage } from "./pages/TripConfirmationPage";
import { DiagnosticsPage } from "./pages/DiagnosticsPage";

export function App() {
  const coordinator = useMemo(() => createCoordinator(), []);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [booting, setBooting] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    void coordinator.loadSession().then((res) => {
      if (res.ok) setSession(res.data);
      setBooting(false);
    });
  }, [coordinator]);

  async function handleLogout() {
    await coordinator.logout();
    setSession(null);
    navigate("/login");
  }

  if (booting) {
    return (
      <div className="app-shell">
        <p className="muted">Loading Trip Workbench…</p>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <div className="brand">Trip Workbench</div>
          <div className="muted">Prepare, validate, and submit a business trip request</div>
        </div>
        <div className="row">
          {session ? (
            <>
              <span className="muted">
                {session.displayName} · {session.role}
              </span>
              <Link to="/trips">Requests</Link>
              {import.meta.env.DEV ? <Link to="/dev/diagnostics">Diagnostics</Link> : null}
              <button type="button" className="btn secondary" onClick={() => void handleLogout()}>
                Sign out
              </button>
            </>
          ) : null}
        </div>
      </header>

      <Routes>
        <Route
          path="/login"
          element={
            session ? (
              <Navigate to="/trips" replace />
            ) : (
              <LoginPage
                coordinator={coordinator}
                onSignedIn={(s) => {
                  setSession(s);
                  navigate("/trips");
                }}
              />
            )
          }
        />
        <Route
          path="/trips"
          element={
            session ? <TripsPage coordinator={coordinator} session={session} /> : <Navigate to="/login" replace />
          }
        />
        <Route
          path="/trips/:id"
          element={
            session ? (
              <TripEditorPage coordinator={coordinator} session={session} />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/trips/:id/review"
          element={
            session ? (
              <TripReviewPage coordinator={coordinator} session={session} />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/trips/:id/confirmation"
          element={
            session ? <TripConfirmationPage coordinator={coordinator} /> : <Navigate to="/login" replace />
          }
        />
        <Route path="/dev/diagnostics" element={<DiagnosticsPage session={session} />} />
        <Route path="*" element={<Navigate to={session ? "/trips" : "/login"} replace />} />
      </Routes>
    </div>
  );
}
