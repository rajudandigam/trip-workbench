import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { Cabin, TripType } from "../../domain/types";
import type { Coordinator, SessionInfo } from "../lib/coordinator";
import { registerTripDraftTools } from "../lib/webmcp";
import { summarizeBriefOnDevice } from "../lib/summarizer";
import { newCommandId } from "../lib/api";

type ProposalView = {
  patch: Record<string, unknown>;
  clarifications: Array<{ field: string | null; kind: string; question: string }>;
  boundRevision: number;
  boundClientEditVersion: number;
  boundBriefVersion: number;
  stale: boolean;
  mode: string;
};

export function TripEditorPage(props: { coordinator: Coordinator; session: SessionInfo }) {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [, tick] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<ProposalView | null>(null);
  const [proposing, setProposing] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [summaryNote, setSummaryNote] = useState<string | null>(null);

  useEffect(() => {
    return props.coordinator.subscribe(() => {
      tick((n) => n + 1);
    });
  }, [props.coordinator]);

  useEffect(() => {
    let cancelled = false;
    props.coordinator.enterEditor(id);
    setProposal(null);
    setError(null);
    void props.coordinator.openDraft(id).then((res) => {
      if (cancelled) return;
      if (!res.ok && res.error.code !== "CONTEXT_MISMATCH") {
        setError(res.error.message);
      }
    });
    return () => {
      cancelled = true;
      props.coordinator.leaveEditor();
      setProposal(null);
    };
  }, [id, props.coordinator]);

  const state = props.coordinator.getState();
  const canMutate =
    props.session.capabilities.canMutateTrips && state.savedDraft?.status === "draft";
  const draftId = state.savedDraft?.id;
  const draftStatus = state.savedDraft?.status;

  useEffect(() => {
    if (!draftId || draftStatus !== "draft") return;
    const controller = new AbortController();
    registerTripDraftTools({
      draftId,
      canMutate: Boolean(canMutate),
      coordinator: props.coordinator,
      signal: controller.signal,
    });
    return () => {
      controller.abort();
    };
  }, [draftId, draftStatus, canMutate, props.coordinator]);

  if (!state.savedDraft || !state.localFields) {
    return <p className="muted">{error || "Loading draft…"}</p>;
  }

  if (state.savedDraft.status === "submitted") {
    return <NavigateConfirmation id={id} />;
  }

  const fields = state.localFields;

  async function save() {
    const res = await props.coordinator.saveManualPatch();
    if (res && !res.ok) setError(res.error.message);
  }

  async function suggest() {
    setProposing(true);
    setError(null);
    const res = await props.coordinator.requestProposal();
    setProposing(false);
    if (!res) return;
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    setProposal({
      ...res.data.proposal,
      boundRevision: res.data.boundRevision,
      boundClientEditVersion: res.data.boundClientEditVersion,
      boundBriefVersion: res.data.boundBriefVersion,
      stale: props.coordinator.isProposalStale(res.data),
      mode: res.data.mode,
    });
  }

  async function applyProposal() {
    if (!proposal || !state.savedDraft) return;
    if (props.coordinator.isProposalStale(proposal)) {
      setProposal({ ...proposal, stale: true });
      setError("Proposal is stale. Request a new suggestion after saving or discarding edits.");
      return;
    }
    const res = await props.coordinator.applyAgentPatch(
      proposal.patch as never,
      proposal.boundRevision,
      newCommandId(),
    );
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    setProposal(null);
  }

  async function onSummarize() {
    setSummaryNote(null);
    const controller = new AbortController();
    const result = await summarizeBriefOnDevice(state.brief, controller.signal);
    if (result.ok) {
      setSummary(result.text);
      setSummaryNote("Generated on this device. Review before relying on it.");
    } else {
      setSummary(null);
      setSummaryNote(
        `${result.message} You can still edit the brief manually. A separate cloud summary is not auto-run.`,
      );
    }
  }

  return (
    <div className="editor-layout">
      <section className="panel stack">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h1>Edit request</h1>
          <span className="muted">
            rev {state.savedDraft.revision} · {state.dirty ? "Unsaved changes" : "Saved"}
          </span>
        </div>
        {state.message ? <div className="notice">{state.message}</div> : null}
        {state.pendingOutcome ? (
          <div className="notice row">
            <span>Unresolved mutation {state.pendingOutcome.commandId}</span>
            <button
              type="button"
              className="btn secondary"
              onClick={() => {
                void props.coordinator.recheckOutcome().then((res) => {
                  if (!res.ok) setError(res.error.message);
                });
              }}
            >
              Recheck outcome
            </button>
          </div>
        ) : null}
        {error ? <p className="error">{error}</p> : null}

        <div className="row">
          <Field
            label="Origin"
            value={fields.origin || ""}
            disabled={!canMutate}
            onChange={(v) => props.coordinator.updateLocalField("origin", v || null)}
            options={["", "SFO", "SJC", "OAK", "JFK", "EWR", "BOS", "LAX", "ORD", "SEA"]}
          />
          <Field
            label="Destination"
            value={fields.destination || ""}
            disabled={!canMutate}
            onChange={(v) => props.coordinator.updateLocalField("destination", v || null)}
            options={["", "SFO", "SJC", "OAK", "JFK", "EWR", "BOS", "LAX", "ORD", "SEA"]}
          />
        </div>
        <div className="row">
          <div className="field">
            <label htmlFor="departureDate">Departure</label>
            <input
              id="departureDate"
              type="date"
              disabled={!canMutate}
              value={fields.departureDate || ""}
              onChange={(e) =>
                props.coordinator.updateLocalField("departureDate", e.target.value || null)
              }
            />
          </div>
          <div className="field">
            <label htmlFor="returnDate">Return</label>
            <input
              id="returnDate"
              type="date"
              disabled={!canMutate || fields.tripType === "one_way"}
              value={fields.returnDate || ""}
              onChange={(e) =>
                props.coordinator.updateLocalField("returnDate", e.target.value || null)
              }
            />
          </div>
        </div>
        <div className="row">
          <div className="field">
            <label htmlFor="tripType">Trip type</label>
            <select
              id="tripType"
              disabled={!canMutate}
              value={fields.tripType}
              onChange={(e) => {
                const tripType = e.target.value as TripType;
                if (tripType === "one_way") {
                  props.coordinator.updateLocalField("tripType", tripType);
                  props.coordinator.updateLocalField("returnDate", null);
                } else {
                  props.coordinator.updateLocalField("tripType", tripType);
                }
              }}
            >
              <option value="round_trip">Round trip</option>
              <option value="one_way">One way</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="cabin">Cabin</label>
            <select
              id="cabin"
              disabled={!canMutate}
              value={fields.cabin}
              onChange={(e) => props.coordinator.updateLocalField("cabin", e.target.value as Cabin)}
            >
              <option value="economy">Economy</option>
              <option value="premium_economy">Premium economy</option>
              <option value="business">Business</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="passengerCount">Travelers</label>
            <input
              id="passengerCount"
              type="number"
              min={1}
              max={9}
              disabled={!canMutate}
              value={fields.passengerCount}
              onChange={(e) =>
                props.coordinator.updateLocalField("passengerCount", Number(e.target.value))
              }
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="purpose">Purpose</label>
          <textarea
            id="purpose"
            rows={3}
            maxLength={500}
            disabled={!canMutate}
            value={fields.purpose}
            onChange={(e) => props.coordinator.updateLocalField("purpose", e.target.value)}
          />
        </div>

        <div className="row">
          <button type="button" className="btn" disabled={!canMutate || !state.dirty || state.saving} onClick={() => void save()}>
            Save draft
          </button>
          <button
            type="button"
            className="btn secondary"
            disabled={!canMutate || !state.dirty}
            onClick={() => props.coordinator.discardLocal()}
          >
            Discard changes
          </button>
          <button
            type="button"
            className="btn secondary"
            disabled={state.dirty || state.saving}
            onClick={() => navigate(`/trips/${id}/review`)}
            title={state.dirty ? "Save your changes before reviewing." : undefined}
          >
            Review request
          </button>
          <Link className="muted" to="/trips">
            Back to list
          </Link>
        </div>
        {state.dirty ? <p className="muted">Save your changes before reviewing.</p> : null}
      </section>

      <aside className="panel stack">
        <h2>Assistance</h2>
        <p className="muted">Gemini assistance proposes fields. You review before anything is saved.</p>
        <div className="field">
          <label htmlFor="brief">Travel brief</label>
          <textarea
            id="brief"
            rows={8}
            value={state.brief}
            disabled={!canMutate}
            onChange={(e) => props.coordinator.updateBrief(e.target.value)}
            placeholder="Prepare a round trip from SFO to JFK…"
          />
        </div>
        <button
          type="button"
          className="btn"
          disabled={!canMutate || !state.brief.trim() || proposing}
          onClick={() => void suggest()}
        >
          {proposing ? "Suggesting…" : "Suggest trip details"}
        </button>
        <button type="button" className="btn secondary" disabled={!state.brief.trim()} onClick={() => void onSummarize()}>
          Summarize brief on this device
        </button>
        {summaryNote ? <p className="muted">{summaryNote}</p> : null}
        {summary ? <div className="notice">{summary}</div> : null}

        {proposal ? (
          <div className="stack">
            <h3>Proposed changes ({proposal.mode})</h3>
            {proposal.stale || props.coordinator.isProposalStale(proposal) ? (
              <div className="notice">Stale proposal — local edits or saved revision changed.</div>
            ) : null}
            <table className="diff-table">
              <thead>
                <tr>
                  <th>Field</th>
                  <th>Proposed</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(proposal.patch).map(([k, v]) => (
                  <tr key={k}>
                    <td>{k}</td>
                    <td>{String(v)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {proposal.clarifications.map((c) => (
              <p key={c.question} className="notice">
                {c.kind}: {c.question}
              </p>
            ))}
            <button
              type="button"
              className="btn"
              disabled={
                proposal.stale ||
                props.coordinator.isProposalStale(proposal) ||
                !Object.keys(proposal.patch).length
              }
              onClick={() => void applyProposal()}
            >
              Apply proposed changes
            </button>
          </div>
        ) : null}
      </aside>
    </div>
  );
}

function NavigateConfirmation({ id }: { id: string }) {
  const navigate = useNavigate();
  useEffect(() => {
    navigate(`/trips/${id}/confirmation`, { replace: true });
  }, [id, navigate]);
  return <p className="muted">Opening confirmation…</p>;
}

function Field(props: {
  label: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  options: string[];
}) {
  const id = props.label.toLowerCase();
  return (
    <div className="field">
      <label htmlFor={id}>{props.label}</label>
      <select
        id={id}
        disabled={props.disabled}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
      >
        {props.options.map((opt) => (
          <option key={opt || "empty"} value={opt}>
            {opt || "—"}
          </option>
        ))}
      </select>
    </div>
  );
}
