import { ChevronDown, LoaderCircle } from "lucide-react";
import { ReferencesList } from "./references-list";
import { styles } from "../lib/studio-client";
import type { StudioState } from "../hooks/use-studio";
export function DesignPanel({ state }: { state: StudioState }) {
  const {
    generating,
    saveStatus,
    notes,
    setNotes,
    style,
    setStyle,
    refine,
    setRefine,
    base,
    active,
    locked,
    generate,
  } = state;
  const session = state.session!;
  return (
    <aside className="panel">
      <div className="panel-body">
        <label className="field">
          <span>Style</span>
          <div className="select">
            <select value={style} onChange={(e) => setStyle(e.target.value)}>
              {styles.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <ChevronDown size={14} />
          </div>
        </label>
        <label className="field">
          <span>Brief</span>
          <textarea
            value={notes}
            maxLength={4000}
            rows={5}
            onChange={(e) => setNotes(e.target.value)}
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
          ) : (
            "Generate image"
          )}
        </button>
        {!session.generationConfigured ? (
          <p className="hint">Image generation isn’t configured. The 3D room works without AI.</p>
        ) : (
          !base && <p className="hint">Add a room photo to generate.</p>
        )}
      </div>
    </aside>
  );
}
