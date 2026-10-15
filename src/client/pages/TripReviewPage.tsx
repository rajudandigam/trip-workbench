import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { ValidationResult } from "../../domain/types";
import type { Coordinator, SessionInfo } from "../lib/coordinator";

export function TripReviewPage(props: { coordinator: Coordinator; session: SessionInfo }) {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setValidation(null);
    void (async () => {
      const opened = await props.coordinator.openDraft(id);
      if (cancelled) return;
      if (!opened.ok) {
        if (opened.error.code !== "CONTEXT_MISMATCH") {
          setError(opened.error.message);
        }
        return;
      }
      const state = props.coordinator.getState();
      if (state.dirty) {
        setError("Save your changes before reviewing.");
        return;
      }
      const res = await props.coordinator.validateSaved();
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
  }, [id, props.coordinator]);

  const draft = props.coordinator.getState().savedDraft;

  async function submit() {
    if (!validation) return;
    setBusy(true);
    const res = await props.coordinator.submit(validation.policyVersion);
    setBusy(false);
    if (!res || !res.ok) {
      setError(res && !res.ok ? res.error.message : "Submit failed");
      return;
    }
    navigate(`/trips/${id}/confirmation`);
  }

  return (
    <div className="panel stack">
      <h1>Review request</h1>
      {error ? <p className="error">{error}</p> : null}
      {draft ? (
        <div className="stack">
          <p>
            <strong>
              {draft.fields.origin} → {draft.fields.destination}
            </strong>
          </p>
          <p className="muted">
            {draft.fields.departureDate}
            {draft.fields.returnDate ? ` – ${draft.fields.returnDate}` : ""} · {draft.fields.cabin} ·{" "}
            {draft.fields.purpose || "(no purpose)"}
          </p>
          <p className="muted">Saved revision {draft.revision}</p>
        </div>
      ) : null}
      {validation ? (
        <div className="stack">
          <h2>Validation</h2>
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
                  <li key={r.code}>{r.message}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="row">
        <Link className="btn secondary" to={`/trips/${id}`}>
          Back to edit
        </Link>
        <button
          type="button"
          className="btn"
          disabled={!validation?.canSubmit || busy || !props.session.capabilities.canMutateTrips}
          onClick={() => void submit()}
        >
          {busy ? "Submitting…" : "Submit request"}
        </button>
      </div>
    </div>
  );
}
