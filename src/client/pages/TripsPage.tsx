import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { TripView } from "../../domain/types";
import type { Coordinator, SessionInfo } from "../lib/coordinator";

function routeSummary(trip: TripView): string {
  const origin = trip.fields.origin || "—";
  const destination = trip.fields.destination || "—";
  return `${origin} → ${destination}`;
}

function dateSummary(trip: TripView): string {
  if (!trip.fields.departureDate) return "No departure date";
  if (trip.fields.tripType === "one_way" || !trip.fields.returnDate) {
    return trip.fields.departureDate;
  }
  return `${trip.fields.departureDate} – ${trip.fields.returnDate}`;
}

export function TripsPage(props: { coordinator: Coordinator; session: SessionInfo }) {
  const [trips, setTrips] = useState<TripView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    setTrips(null);
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
          <button type="button" className="btn" data-testid="create-trip" onClick={() => void createTrip()}>
            New trip request
          </button>
        ) : (
          <span className="muted">Read-only observer</span>
        )}
      </div>
      {error ? <p className="error">{error}</p> : null}
      {trips === null ? <p className="muted" data-testid="trips-loading">Loading requests…</p> : null}
      {trips && !trips.length ? (
        <p className="muted" data-testid="trips-empty">
          No requests yet. Create a draft to start.
        </p>
      ) : null}
      {trips && trips.length ? (
        <ul className="trip-list" data-testid="trip-list">
          {trips.map((trip) => (
            <li key={trip.id}>
              <Link to={`/trips/${trip.id}`} data-testid={`trip-link-${trip.id}`}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <strong data-testid="trip-route">{routeSummary(trip)}</strong>
                  <span className={`status-pill status-${trip.status}`} data-testid="trip-status">
                    {trip.status}
                  </span>
                </div>
                <div className="muted" data-testid="trip-dates">
                  {dateSummary(trip)} · {trip.fields.cabin} · {trip.fields.passengerCount} traveler
                  {trip.fields.passengerCount === 1 ? "" : "s"} · rev {trip.revision}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
