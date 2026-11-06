import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { EventView } from "../../domain/event-types";
import type { EventCoordinator } from "../lib/event-coordinator";

export function EventConfirmationPage(props: { eventCoordinator: EventCoordinator }) {
  const { id = "" } = useParams();
  const [event, setEvent] = useState<EventView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void props.eventCoordinator.openDraft(id).then((res) => {
      if (!res.ok) {
        setError(res.error.message);
        return;
      }
      setEvent(res.data);
    });
  }, [id, props.eventCoordinator]);

  if (error) return <p className="error">{error}</p>;
  if (!event) return <p className="muted">Loading confirmation…</p>;

  return (
    <div className="panel stack">
      <h1>Event request recorded</h1>
      <p className="muted">
        Synthetic confirmation only. No invitations were sent and no venue was booked.
      </p>
      <p>
        <strong>{event.fields.title}</strong>
      </p>
      <p className="muted">
        {event.fields.startDate} – {event.fields.endDate} · {event.fields.timeZone}
      </p>
      <p className="muted">{event.fields.locationLabel}</p>
      <p className="muted">Status: {event.status} · revision {event.revision}</p>
      <div className="row">
        <Link className="btn secondary" to="/events">
          Back to events
        </Link>
        <Link className="btn secondary" to="/trips">
          Trip requests
        </Link>
      </div>
    </div>
  );
}
