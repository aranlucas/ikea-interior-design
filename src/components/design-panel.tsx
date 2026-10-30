import { ChevronDown, LoaderCircle } from "lucide-react";
import { ReferencesList } from "./references-list";
import {
  styles,
  modes,
  peopleChoices,
  lightingChoices,
  type People,
  type Lighting,
} from "../lib/studio-client";
import type { StudioState } from "../hooks/use-studio";
export function DesignPanel({ state }: { state: StudioState }) {
  const {
    generating,
    saveStatus,
    draftFields,
    refine,
    setRefine,
    mode,
    setMode,
    measurements,
    setMeasurements,
    count,
    setCount,
    people,
    setPeople,
    lighting,
    setLighting,
    base,
    active,
    locked,
    generate,
  } = state;
  const session = state.session!;
  return (
    <aside className="panel">
      <div className="panel-body">
        <div className="field">
          <div className="field-head">
            <span>Mode</span>
          </div>
          <div className="segmented full" role="group" aria-label="Design mode">
            {modes.map((m) => (
              <button
                key={m.id}
                type="button"
                aria-pressed={mode === m.id}
                disabled={locked}
                onClick={() => setMode(m.id)}
              >
                {m.label}
              </button>
            ))}
          </div>
          <p className="hint">{modes.find((m) => m.id === mode)?.hint}</p>
        </div>
        <label className="field">
          <span>Style</span>
          <div className="select">
            <select {...draftFields.style}>
              {styles.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <ChevronDown size={14} />
          </div>
        </label>
        <div className="field-row">
          <label className="field">
            <span>
              People <em>optional</em>
            </span>
            <div className="select">
              <select value={people} onChange={(e) => setPeople(e.target.value as People)}>
                {peopleChoices.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} />
            </div>
          </label>
          <label className="field">
            <span>Lighting</span>
            <div className="select">
              <select value={lighting} onChange={(e) => setLighting(e.target.value as Lighting)}>
                {lightingChoices.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} />
            </div>
          </label>
        </div>
        <label className="field">
          <span>
            Room size <em>optional — anchors product scale</em>
          </span>
          <input
            value={measurements}
            maxLength={200}
            onChange={(e) => setMeasurements(e.target.value)}
            placeholder="e.g. 4.2 × 3.6 m, ceiling 2.6 m"
          />
        </label>
        <label className="field">
          <span>Brief</span>
          <textarea
            {...draftFields.notes}
            maxLength={4000}
            rows={5}
            placeholder="Keep the floors. Linen sofa by the window, oak side table."
          />
        </label>
        <ReferencesList state={state} />
      </div>
      <div className="panel-foot">
        {saveStatus && (
          <span className="muted small" role="status">
            {saveStatus}
          </span>
        )}
        {active && (
          <label className="checkbox">
            <input type="checkbox" checked={refine} onChange={(e) => setRefine(e.target.checked)} />{" "}
            Refine this design
          </label>
        )}
        <div className="field">
          <div className="field-head">
            <span>Variations</span>
          </div>
          <div className="segmented" role="group" aria-label="Designs to generate">
            {([1, 2, 4] as const).map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={count === n}
                disabled={locked}
                onClick={() => setCount(n)}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
        <button
          className="button primary block"
          disabled={!base || locked || !session.generationConfigured}
          onClick={() => void generate()}
        >
          {generating ? (
            <>
              <LoaderCircle size={16} className="spin" /> Generating…
            </>
          ) : refine ? (
            "Refine"
          ) : count > 1 ? (
            `Generate ${count}`
          ) : (
            "Generate"
          )}
        </button>
        {!session.generationConfigured ? (
          <p className="hint">Image generation isn’t configured on this server.</p>
        ) : (
          !base && <p className="hint">Add a room photo to generate.</p>
        )}
      </div>
    </aside>
  );
}
