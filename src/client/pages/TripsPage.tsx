import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { TripView } from "../../domain/types";
import type { Coordinator, SessionInfo } from "../lib/coordinator";

export function TripsPage(props: { coordinator: Coordinator; session: SessionInfo }) {
  const [trips, setTrips] = useState<TripView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    void props.coordinator.listTrips().then((res) => {
      if (res.ok) setTrips(res.data);
      else setError(res.error.message);
    });
  }, [props.coordinator]);

  async function createTrip() {
    const res = await props.coordinator.createTrip();
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    navigate(`/trips/${res.data.tripId}`);
  }

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1>Trip requests</h1>
        {props.session.capabilities.canMutateTrips ? (
          <button type="button" className="btn" onClick={() => void createTrip()}>
            New trip request
          </button>
        ) : (
          <span className="muted">Read-only observer</span>
        )}
      </div>
      {error ? <p className="error">{error}</p> : null}
      <ul className="trip-list">
        {trips.map((trip) => (
          <li key={trip.id}>
            <Link to={`/trips/${trip.id}`}>
              <strong>
                {trip.fields.origin || "—"} → {trip.fields.destination || "—"}
              </strong>
              <div className="muted">
                {trip.fields.departureDate || "No departure"} · {trip.status} · rev {trip.revision}
              </div>
            </Link>
          </li>
        ))}
      </ul>
      {!trips.length ? <p className="muted">No requests yet.</p> : null}
    </div>
  );
}
