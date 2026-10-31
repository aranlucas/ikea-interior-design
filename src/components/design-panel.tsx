import { ChevronDown, LoaderCircle } from "lucide-react";
import { ReferencesList } from "./references-list";
import { styles } from "../lib/studio-client";
import type { StudioState } from "../hooks/use-studio";
import { ImageSettings } from "./image-settings";
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
  const failed = state.job?.roomId === state.roomId && state.job.status === "failed";
  const elsewhere = !generating && state.job?.status === "running";
  return (
    <aside className="panel" aria-label="Design brief and image settings">
      <div className="panel-body">
        <div className="panel-heading">
          <h1>Design your room</h1>
          <p>Choose a photo, describe your idea, then generate.</p>
        </div>
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
        <ImageSettings
          value={state.imageSettings}
          onChange={state.setImageSettings}
          model={session.imageModel}
          disabled={generating}
        />
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
        {failed && !generating && (
          <p className="generation-error" role="status">
            {state.job?.error || "Could not generate your design. Try again."}
          </p>
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
          ) : failed ? (
            "Try again"
          ) : refine ? (
            "Refine"
          ) : (
            "Generate image"
          )}
        </button>
        {!session.generationConfigured ? (
          <p className="hint">
            To generate images, add OPENAI_API_KEY to the server. You can still add photos and build
            a 3D room without AI.
          </p>
        ) : elsewhere ? (
          <p className="hint" role="status">
            A design is generating in another room. You can generate here when it finishes.
          </p>
        ) : generating ? (
          <p className="hint" role="status">
            Your result saves to this room. You can return later.
          </p>
        ) : !base ? (
          <p className="hint">Add a room photo to generate.</p>
        ) : (
          <p className="hint">
            Uses OpenAI API credits. Input images are billed separately from image output.
          </p>
        )}
      </div>
    </aside>
  );
}
