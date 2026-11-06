import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { EventValidationResult } from "../../domain/event-types";
import type { EventCoordinator } from "../lib/event-coordinator";
import type { SessionInfo } from "../lib/coordinator";

export function EventReviewPage(props: {
  eventCoordinator: EventCoordinator;
  session: SessionInfo;
}) {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [validation, setValidation] = useState<EventValidationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [, tick] = useState(0);

  useEffect(() => {
    return props.eventCoordinator.subscribe(() => tick((n) => n + 1));
  }, [props.eventCoordinator]);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setValidation(null);
    void (async () => {
      const opened = await props.eventCoordinator.openDraft(id);
      if (cancelled) return;
      if (!opened.ok) {
        setError(opened.error.message);
        return;
      }
      if (props.eventCoordinator.getState().dirty) {
        setError("Save your changes before reviewing.");
        return;
      }
      const res = await props.eventCoordinator.validateAtRevision(
        id,
        props.eventCoordinator.getState().savedDraft!.revision,
      );
      if (cancelled || !res) return;
      if (!res.ok) {
        setError(res.error.message);
        return;
      }
      setValidation(res.data);
    })();
    return () => {
      cancelled = true;
    };
  }, [id, props.eventCoordinator]);

  const draft = props.eventCoordinator.getState().savedDraft;
  const canMutate = Boolean(
    props.session.capabilities.canMutateEvents ?? props.session.capabilities.canMutateTrips,
  );

  async function submit() {
    if (!validation) return;
    setBusy(true);
    const res = await props.eventCoordinator.submit(
      validation.revision,
      validation.policyVersion,
    );
    setBusy(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    navigate(`/events/${id}/confirmation`);
  }

  return (
    <div className="panel stack">
      <h1>Review event</h1>
      <p className="muted">
        Recording stores a synthetic submission snapshot. It does not invite attendees or book a venue.
      </p>
      {error ? <p className="error">{error}</p> : null}
      {draft ? (
        <div className="stack">
          <p>
            <strong>{draft.fields.title || "(untitled)"}</strong>
          </p>
          <p className="muted">
            {draft.fields.startDate} – {draft.fields.endDate} · {draft.fields.timeZone}
          </p>
          <p className="muted">
            {draft.fields.locationMode}: {draft.fields.locationLabel || "(none)"}
          </p>
          <p className="muted">
            Reviewed revision {validation?.revision ?? draft.revision}
            {validation ? ` · policy ${validation.policyVersion}` : ""}
          </p>
        </div>
      ) : null}
      {validation ? (
        <div className="stack">
          {validation.fieldIssues.length ? (
            <ul>
              {validation.fieldIssues.map((issue) => (
                <li key={`${issue.field}-${issue.code}`} className="error">
                  {issue.field}: {issue.message}
                </li>
              ))}
            </ul>
          ) : (
            <p>All required fields look complete.</p>
          )}
          {validation.reviewRequirements.length ? (
            <div className="notice">
              <strong>Review requirements</strong>
              <ul>
                {validation.reviewRequirements.map((r) => (
                  <li key={r.code}>
                    <code>{r.code}</code>: {r.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="row">
        <Link className="btn secondary" to={`/events/${id}`}>
          Back to edit
        </Link>
        <button
          type="button"
          className="btn"
          disabled={!validation?.canSubmit || busy || !canMutate}
          onClick={() => void submit()}
        >
          {busy ? "Recording…" : "Record event request"}
        </button>
      </div>
    </div>
  );
}
