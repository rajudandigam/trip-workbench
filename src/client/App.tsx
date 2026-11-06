import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { createCoordinator, type SessionInfo } from "./lib/coordinator";
import { createEventCoordinator } from "./lib/event-coordinator";
import { LoginPage } from "./pages/LoginPage";
import { TripsPage } from "./pages/TripsPage";
import { TripEditorPage } from "./pages/TripEditorPage";
import { TripReviewPage } from "./pages/TripReviewPage";
import { TripConfirmationPage } from "./pages/TripConfirmationPage";
import { EventsPage } from "./pages/EventsPage";
import { EventEditorPage } from "./pages/EventEditorPage";
import { EventReviewPage } from "./pages/EventReviewPage";
import { EventConfirmationPage } from "./pages/EventConfirmationPage";
import { DiagnosticsPage } from "./pages/DiagnosticsPage";

export function App() {
  const coordinator = useMemo(() => createCoordinator(), []);
  const eventCoordinator = useMemo(() => createEventCoordinator(), []);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [booting, setBooting] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    void coordinator.loadSession().then((res) => {
      if (res.ok) setSession(res.data);
      setBooting(false);
    });
  }, [coordinator]);

  const [logoutError, setLogoutError] = useState<string | null>(null);

  async function handleLogout() {
    setLogoutError(null);
    const res = await coordinator.logout();
    if (!res.ok) {
      setLogoutError(res.error.message);
      return;
    }
    eventCoordinator.leaveEditor();
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
          <div className="muted">Prepare trip requests and synthetic event drafts</div>
        </div>
        <div className="row">
          {session ? (
            <>
              <span className="muted">
                {session.displayName} · {session.role}
              </span>
              <Link to="/trips">Trips</Link>
              <Link to="/events" data-testid="nav-events">
                Events
              </Link>
              {import.meta.env.DEV ? <Link to="/dev/diagnostics">Diagnostics</Link> : null}
              <button type="button" className="btn secondary" onClick={() => void handleLogout()}>
                Sign out
              </button>
            </>
          ) : null}
        </div>
      </header>
      {logoutError ? (
        <p className="error" role="alert">
          Sign-out failed: {logoutError}
        </p>
      ) : null}

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
        <Route
          path="/events"
          element={
            session ? (
              <EventsPage eventCoordinator={eventCoordinator} session={session} />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/events/:id"
          element={
            session ? (
              <EventEditorPage eventCoordinator={eventCoordinator} session={session} />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/events/:id/review"
          element={
            session ? (
              <EventReviewPage eventCoordinator={eventCoordinator} session={session} />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/events/:id/confirmation"
          element={
            session ? (
              <EventConfirmationPage eventCoordinator={eventCoordinator} />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route path="/dev/diagnostics" element={<DiagnosticsPage session={session} />} />
        <Route path="*" element={<Navigate to={session ? "/trips" : "/login"} replace />} />
      </Routes>
    </div>
  );
}
