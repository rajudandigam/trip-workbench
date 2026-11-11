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
  const [, tick] = useState(0);

  useEffect(() => {
    return props.coordinator.subscribe(() => tick((n) => n + 1));
  }, [props.coordinator]);

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
      if (state.pendingOutcome?.kind === "submit" && state.pendingOutcome.draftId === id) {
        // Keep the reviewed snapshot visible; do not re-validate over an uncertain submit.
        if (
          state.pendingOutcome.reviewedRevision != null &&
          state.pendingOutcome.reviewedPolicyVersion
        ) {
          setValidation({
            tripId: id,
            revision: state.pendingOutcome.reviewedRevision,
            policyVersion: state.pendingOutcome.reviewedPolicyVersion,
            valid: true,
            canSubmit: true,
            fieldIssues: [],
            reviewRequirements: [],
          });
        }
        setError(
          "We could not confirm whether this request was submitted. Use Recheck submission before trying again.",
        );
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
  const pending = props.coordinator.getState().pendingOutcome;
  const pendingSubmit =
    pending?.kind === "submit" && pending.draftId === id ? pending : null;

  async function submit() {
    if (!validation) return;
    setBusy(true);
    const res = await props.coordinator.submit(validation.revision, validation.policyVersion);
    setBusy(false);
    if (!res || !res.ok) {
      setError(res && !res.ok ? res.error.message : "Submit failed");
      return;
    }
    navigate(`/trips/${id}/confirmation`);
  }

  async function recheckSubmission() {
    setBusy(true);
    setError(null);
    const res = await props.coordinator.recheckOutcome({
      draftId: id,
      commandId: pendingSubmit?.commandId,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    const status = props.coordinator.getState().savedDraft?.status;
    if (status === "submitted") {
      navigate(`/trips/${id}/confirmation`);
      return;
    }
    setError("Recheck completed, but the trip is not marked submitted yet.");
  }

  return (
    <div className="panel stack">
      <h1>Review request</h1>
      {error ? <p className="error" data-testid="review-error">{error}</p> : null}
      {draft ? (
        <div className="stack" data-testid="review-fields">
          <p>
            <strong>
              {draft.fields.origin} → {draft.fields.destination}
            </strong>
          </p>
          <p className="muted">
            {draft.fields.departureDate}
            {draft.fields.returnDate ? ` – ${draft.fields.returnDate}` : ""} · {draft.fields.tripType} ·{" "}
            {draft.fields.cabin} · {draft.fields.passengerCount} traveler
            {draft.fields.passengerCount === 1 ? "" : "s"}
          </p>
          <p className="muted">Purpose: {draft.fields.purpose || "(none)"}</p>
          <p className="muted" data-testid="review-revision">
            Reviewed revision{" "}
            {pendingSubmit?.reviewedRevision ?? validation?.revision ?? draft.revision}
            {validation ? ` · policy ${validation.policyVersion}` : ""}
            {pendingSubmit?.reviewedPolicyVersion && !validation
              ? ` · policy ${pendingSubmit.reviewedPolicyVersion}`
              : ""}
          </p>
        </div>
      ) : null}
      {validation ? (
        <div className="stack" data-testid="review-findings">
          <h2>Validation</h2>
          {validation.fieldIssues.length ? (
            <ul data-testid="review-field-issues">
              {validation.fieldIssues.map((issue) => (
                <li key={`${issue.field}-${issue.code}`} className="error">
                  {issue.field}: {issue.message}
                </li>
              ))}
            </ul>
          ) : (
            <p data-testid="review-fields-complete">All required fields look complete.</p>
          )}
          {validation.reviewRequirements.length ? (
            <div className="notice" data-testid="review-requirements">
              <strong>Review requirements</strong>
              <p className="muted">These do not block submission by themselves.</p>
              <ul>
                {validation.reviewRequirements.map((r) => (
                  <li key={r.code}>
                    <code>{r.code}</code>: {r.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="muted" data-testid="review-no-requirements">
              No additional policy review requirements.
            </p>
          )}
        </div>
      ) : null}
      {pendingSubmit ? (
        <div className="notice row" data-testid="pending-submission">
          <span>
            Unresolved submission <code>{pendingSubmit.commandId}</code>. Recheck the original
            receipt before submitting again.
          </span>
          <button
            type="button"
            className="btn secondary"
            data-testid="recheck-submission"
            disabled={busy}
            onClick={() => void recheckSubmission()}
          >
            {busy ? "Rechecking…" : "Recheck submission"}
          </button>
        </div>
      ) : null}
      <div className="row">
        <Link className="btn secondary" to={`/trips/${id}`}>
          Back to edit
        </Link>
        <button
          type="button"
          className="btn"
          data-testid="submit-request"
          disabled={
            !validation?.canSubmit ||
            busy ||
            !!pendingSubmit ||
            !props.session.capabilities.canMutateTrips
          }
          onClick={() => void submit()}
        >
          {busy ? "Submitting…" : "Submit request"}
        </button>
      </div>
    </div>
  );
}
