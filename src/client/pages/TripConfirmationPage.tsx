import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { TripView } from "../../domain/types";
import type { Coordinator } from "../lib/coordinator";

export function TripConfirmationPage(props: { coordinator: Coordinator }) {
  const { id = "" } = useParams();
  const [trip, setTrip] = useState<TripView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void props.coordinator.openDraft(id).then((res) => {
      if (res.ok) setTrip(res.data);
      else setError(res.error.message);
    });
  }, [id, props.coordinator]);

  if (error) return <p className="error">{error}</p>;
  if (!trip) return <p className="muted">Loading confirmation…</p>;

  return (
    <div className="panel stack">
      <h1>Trip request submitted</h1>
      <p className="muted">Request ID {trip.id}</p>
      <p>
        <strong>
          {trip.fields.origin} → {trip.fields.destination}
        </strong>
      </p>
      <p>
        {trip.fields.departureDate}
        {trip.fields.returnDate ? ` – ${trip.fields.returnDate}` : ""}
      </p>
      <p>{trip.fields.purpose}</p>
      {trip.submittedAt ? <p className="muted">Submitted {trip.submittedAt}</p> : null}
      {trip.reviewRequirements?.length ? (
        <div className="notice">
          <strong>Review requirements</strong>
          <ul>
            {trip.reviewRequirements.map((r) => (
              <li key={r.code}>{r.message}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <Link to="/trips">Back to requests</Link>
    </div>
  );
}
