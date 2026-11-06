import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  EVENT_TIME_ZONES,
  SYNTHETIC_VENUES,
  type EventLocationMode,
} from "../../domain/event-types";
import type { EventCoordinator } from "../lib/event-coordinator";
import type { SessionInfo } from "../lib/coordinator";
import { registerEventDraftTools } from "../lib/event-webmcp";
import type { ToolRegistrationState } from "../lib/webmcp";
import { DeclarativeEventFields } from "../components/DeclarativeEventFields";

export function EventEditorPage(props: {
  eventCoordinator: EventCoordinator;
  session: SessionInfo;
}) {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [, tick] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [registration, setRegistration] = useState<ToolRegistrationState>({
    phase: "unsupported",
    detail: "Waiting for draft context",
  });
  const [useDeclarative, setUseDeclarative] = useState(false);

  useEffect(() => {
    return props.eventCoordinator.subscribe(() => tick((n) => n + 1));
  }, [props.eventCoordinator]);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    void props.eventCoordinator.openDraft(id).then((res) => {
      if (cancelled) return;
      if (!res.ok) setError(res.error.message);
    });
    return () => {
      cancelled = true;
      props.eventCoordinator.leaveEditor();
    };
  }, [id, props.eventCoordinator]);

  const state = props.eventCoordinator.getState();
  const canMutate =
    Boolean(props.session.capabilities.canMutateEvents ?? props.session.capabilities.canMutateTrips) &&
    state.savedDraft?.status === "draft";
  const eventId = state.savedDraft?.id;
  const draftStatus = state.savedDraft?.status;

  useEffect(() => {
    if (!eventId || draftStatus !== "draft") {
      setRegistration({
        phase: "unsupported",
        detail: draftStatus === "submitted" ? "Submitted events do not expose editing tools" : "No draft",
      });
      return;
    }
    const controller = new AbortController();
    registerEventDraftTools({
      eventId,
      canMutate: Boolean(canMutate),
      coordinator: props.eventCoordinator,
      signal: controller.signal,
      onStatus: setRegistration,
    });
    return () => controller.abort();
  }, [eventId, draftStatus, canMutate, props.eventCoordinator]);

  if (!state.savedDraft || !state.localFields) {
    return <p className="muted">{error || "Loading event draft…"}</p>;
  }

  if (state.savedDraft.status === "submitted") {
    return <SubmittedRedirect id={id} />;
  }

  const fields = state.localFields;
  const prepared = state.preparedReview;

  async function save() {
    const res = await props.eventCoordinator.saveManualPatch();
    if (res && !res.ok) setError(res.error.message);
  }

  return (
    <div className="editor-layout">
      <section className="panel stack">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h1>Edit event draft</h1>
          <span className="muted" data-testid="event-editor-status">
            rev {state.savedDraft.revision} · {state.dirty ? "Unsaved changes" : "Saved"}
          </span>
        </div>
        <div className="saved-summary" data-testid="event-saved-summary">
          <strong>Saved state</strong>
          <div className="muted">
            {state.savedDraft.fields.title || "(untitled)"} · {state.savedDraft.fields.startDate || "—"}{" "}
            → {state.savedDraft.fields.endDate || "—"} · {state.savedDraft.fields.timeZone}
          </div>
          <div className="muted">{state.savedDraft.fields.locationLabel || "No location"}</div>
        </div>
        {state.message ? <div className="notice">{state.message}</div> : null}
        {error ? <p className="error">{error}</p> : null}
        {prepared ? (
          <div className="notice stack" data-testid="event-prepared-review">
            <strong>Prepared review (inline)</strong>
            <p className="muted">
              Revision {prepared.revision} · policy {prepared.policyVersion} · still a draft
            </p>
            {prepared.fieldIssues.length ? (
              <ul>
                {prepared.fieldIssues.map((issue) => (
                  <li key={`${issue.field}-${issue.code}`} className="error">
                    {issue.field}: {issue.message}
                  </li>
                ))}
              </ul>
            ) : (
              <p>No blocking field issues.</p>
            )}
            {prepared.reviewRequirements.map((r) => (
              <p key={r.code}>
                <code>{r.code}</code>: {r.message}
              </p>
            ))}
            <button
              type="button"
              className="btn secondary"
              onClick={() => props.eventCoordinator.clearPreparedReview()}
            >
              Dismiss
            </button>
          </div>
        ) : null}

        <div className="row">
          <label>
            <input
              type="checkbox"
              checked={useDeclarative}
              onChange={(e) => setUseDeclarative(e.target.checked)}
            />{" "}
            Try declarative field experiment
          </label>
        </div>

        {useDeclarative ? (
          <DeclarativeEventFields
            fields={fields}
            disabled={!canMutate}
            onChange={(key, value) => props.eventCoordinator.updateLocalField(key, value)}
          />
        ) : (
          <>
            <div className="field">
              <label htmlFor="event-title">Title</label>
              <input
                id="event-title"
                disabled={!canMutate}
                value={fields.title}
                onChange={(e) => props.eventCoordinator.updateLocalField("title", e.target.value)}
              />
            </div>
            <div className="row">
              <div className="field">
                <label htmlFor="event-start">Start date</label>
                <input
                  id="event-start"
                  type="date"
                  disabled={!canMutate}
                  value={fields.startDate || ""}
                  onChange={(e) =>
                    props.eventCoordinator.updateLocalField("startDate", e.target.value || null)
                  }
                />
              </div>
              <div className="field">
                <label htmlFor="event-end">End date</label>
                <input
                  id="event-end"
                  type="date"
                  disabled={!canMutate}
                  value={fields.endDate || ""}
                  onChange={(e) =>
                    props.eventCoordinator.updateLocalField("endDate", e.target.value || null)
                  }
                />
              </div>
            </div>
            <div className="field">
              <label htmlFor="event-tz">Time zone</label>
              <select
                id="event-tz"
                disabled={!canMutate}
                value={fields.timeZone}
                onChange={(e) => props.eventCoordinator.updateLocalField("timeZone", e.target.value)}
              >
                {EVENT_TIME_ZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </div>
            <div className="row">
              <div className="field">
                <label htmlFor="event-loc-mode">Location mode</label>
                <select
                  id="event-loc-mode"
                  disabled={!canMutate}
                  value={fields.locationMode}
                  onChange={(e) => {
                    const mode = e.target.value as EventLocationMode;
                    props.eventCoordinator.updateLocalField("locationMode", mode);
                    if (mode === "synthetic") {
                      props.eventCoordinator.updateLocalField("locationLabel", "");
                    }
                  }}
                >
                  <option value="synthetic">Synthetic venue</option>
                  <option value="manual">Manual label</option>
                </select>
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label htmlFor="event-loc">Location</label>
                {fields.locationMode === "synthetic" ? (
                  <select
                    id="event-loc"
                    disabled={!canMutate}
                    value={fields.locationLabel}
                    onChange={(e) =>
                      props.eventCoordinator.updateLocalField("locationLabel", e.target.value)
                    }
                  >
                    <option value="">—</option>
                    {SYNTHETIC_VENUES.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id="event-loc"
                    disabled={!canMutate}
                    value={fields.locationLabel}
                    placeholder="Building / room / address label"
                    onChange={(e) =>
                      props.eventCoordinator.updateLocalField("locationLabel", e.target.value)
                    }
                  />
                )}
              </div>
            </div>
            <div className="field">
              <label htmlFor="event-notes">Notes</label>
              <textarea
                id="event-notes"
                rows={3}
                disabled={!canMutate}
                value={fields.notes}
                onChange={(e) => props.eventCoordinator.updateLocalField("notes", e.target.value)}
              />
            </div>
          </>
        )}

        <div className="row">
          <button
            type="button"
            className="btn"
            disabled={!canMutate || !state.dirty || state.saving}
            onClick={() => void save()}
          >
            Save draft
          </button>
          <button
            type="button"
            className="btn secondary"
            disabled={!canMutate || !state.dirty}
            onClick={() => props.eventCoordinator.discardLocal()}
          >
            Discard changes
          </button>
          <button
            type="button"
            className="btn secondary"
            disabled={state.dirty || state.saving}
            onClick={() => navigate(`/events/${id}/review`)}
          >
            Review event
          </button>
          <Link className="muted" to="/events">
            Back to list
          </Link>
        </div>
      </section>

      <aside className="panel stack">
        <h2>Assistance</h2>
        <p className="muted">
          Event tools are page-scoped. Open this draft to discover them. There is no invite or calendar
          send path.
        </p>
        <p className="muted registration-status" data-testid="event-webmcp-registration">
          WebMCP: {registration.phase}
          {registration.detail ? ` — ${registration.detail}` : ""}
        </p>
        <p className="muted">
          Entry point for agents remains the authenticated Events list. Tools appear only while this
          editor is mounted.
        </p>
      </aside>
    </div>
  );
}

function SubmittedRedirect({ id }: { id: string }) {
  const navigate = useNavigate();
  useEffect(() => {
    navigate(`/events/${id}/confirmation`, { replace: true });
  }, [id, navigate]);
  return <p className="muted">Opening confirmation…</p>;
}
