import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { EventView } from "../../domain/event-types";
import type { EventCoordinator } from "../lib/event-coordinator";
import type { SessionInfo } from "../lib/coordinator";

export function EventsPage(props: {
  eventCoordinator: EventCoordinator;
  session: SessionInfo;
}) {
  const [events, setEvents] = useState<EventView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const canMutate = Boolean(props.session.capabilities.canMutateEvents ?? props.session.capabilities.canMutateTrips);

  useEffect(() => {
    setEvents(null);
    void props.eventCoordinator.listEvents().then((res) => {
      if (res.ok) setEvents(res.data);
      else setError(res.error.message);
    });
  }, [props.eventCoordinator]);

  async function createEvent() {
    const res = await props.eventCoordinator.createEvent();
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    navigate(`/events/${res.data.eventId}`);
  }

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <h1>Event drafts</h1>
          <p className="muted">
            Synthetic event planning only. Recording a draft does not send invitations or book venues.
          </p>
        </div>
        {canMutate ? (
          <button type="button" className="btn" data-testid="create-event" onClick={() => void createEvent()}>
            New event draft
          </button>
        ) : (
          <span className="muted">Read-only observer</span>
        )}
      </div>
      {error ? <p className="error">{error}</p> : null}
      {events === null ? <p className="muted">Loading events…</p> : null}
      {events && !events.length ? (
        <p className="muted" data-testid="events-empty">
          No event drafts yet.
        </p>
      ) : null}
      {events && events.length ? (
        <ul className="trip-list" data-testid="event-list">
          {events.map((event) => (
            <li key={event.id}>
              <Link to={`/events/${event.id}`}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <strong>{event.fields.title || "(untitled event)"}</strong>
                  <span className={`status-pill status-${event.status}`}>{event.status}</span>
                </div>
                <div className="muted">
                  {event.fields.startDate || "No start"}
                  {event.fields.endDate ? ` – ${event.fields.endDate}` : ""} · {event.fields.timeZone} ·{" "}
                  {event.fields.locationLabel || "No location"} · rev {event.revision}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
