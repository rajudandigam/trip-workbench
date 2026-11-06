import {
  EVENT_TIME_ZONES,
  SYNTHETIC_VENUES,
  type EventFields,
  type EventLocationMode,
} from "../../domain/event-types";

type Props = {
  fields: EventFields;
  disabled?: boolean;
  onChange: <K extends keyof EventFields>(key: K, value: EventFields[K]) => void;
};

/**
 * Declarative-form experiment for Phase 2.
 *
 * Chrome/WebMCP declarative tooling is still evolving. This component probes for a
 * documented declarative surface when present, but always keeps a working manual
 * fallback so the wizard remains usable. A manual render is never labeled as
 * proof that declarative WebMCP forms work.
 */
export function DeclarativeEventFields(props: Props) {
  const declarativeAvailable =
    typeof document !== "undefined" &&
    Boolean(
      (document as Document & { modelContext?: { declarativeForms?: unknown } }).modelContext
        ?.declarativeForms,
    );

  return (
    <div className="stack" data-testid="declarative-event-fields">
      <div className="notice">
        {declarativeAvailable ? (
          <p>
            A declarative form surface was detected on <code>document.modelContext</code>. This demo
            still uses the manual fallback for field binding until the native contract is pinned.
          </p>
        ) : (
          <p>
            Declarative WebMCP forms are unavailable in this browser. Showing the manual fallback.
            Do not treat this fallback as declarative-form evidence.
          </p>
        )}
      </div>

      <div className="field">
        <label htmlFor="decl-title">Title</label>
        <input
          id="decl-title"
          disabled={props.disabled}
          value={props.fields.title}
          onChange={(e) => props.onChange("title", e.target.value)}
        />
      </div>
      <div className="row">
        <div className="field">
          <label htmlFor="decl-start">Start date</label>
          <input
            id="decl-start"
            type="date"
            disabled={props.disabled}
            value={props.fields.startDate || ""}
            onChange={(e) => props.onChange("startDate", e.target.value || null)}
          />
        </div>
        <div className="field">
          <label htmlFor="decl-end">End date</label>
          <input
            id="decl-end"
            type="date"
            disabled={props.disabled}
            value={props.fields.endDate || ""}
            onChange={(e) => props.onChange("endDate", e.target.value || null)}
          />
        </div>
      </div>
      <div className="field">
        <label htmlFor="decl-tz">Time zone</label>
        <select
          id="decl-tz"
          disabled={props.disabled}
          value={props.fields.timeZone}
          onChange={(e) => props.onChange("timeZone", e.target.value)}
        >
          {EVENT_TIME_ZONES.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="decl-mode">Location mode</label>
        <select
          id="decl-mode"
          disabled={props.disabled}
          value={props.fields.locationMode}
          onChange={(e) => props.onChange("locationMode", e.target.value as EventLocationMode)}
        >
          <option value="synthetic">Synthetic venue</option>
          <option value="manual">Manual label</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="decl-loc">Location</label>
        {props.fields.locationMode === "synthetic" ? (
          <select
            id="decl-loc"
            disabled={props.disabled}
            value={props.fields.locationLabel}
            onChange={(e) => props.onChange("locationLabel", e.target.value)}
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
            id="decl-loc"
            disabled={props.disabled}
            value={props.fields.locationLabel}
            onChange={(e) => props.onChange("locationLabel", e.target.value)}
          />
        )}
      </div>
      <div className="field">
        <label htmlFor="decl-notes">Notes</label>
        <textarea
          id="decl-notes"
          rows={3}
          disabled={props.disabled}
          value={props.fields.notes}
          onChange={(e) => props.onChange("notes", e.target.value)}
        />
      </div>
    </div>
  );
}
