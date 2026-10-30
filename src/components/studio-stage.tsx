import { useEffect } from "react";
import { Download, ImagePlus, LoaderCircle, MoveHorizontal, Star } from "lucide-react";
import { assetUrl } from "../lib/types";
import { stepPhoto } from "../lib/photo-nav";
import { Filmstrips } from "./filmstrips";
import type { StudioState } from "../hooks/use-studio";
export function StudioStage({ state }: { state: StudioState }) {
  const {
    generating,
    setView,
    split,
    setSplit,
    dragging,
    setDragging,
    input,
    photos,
    base,
    design,
    shown,
    active,
    before,
    locked,
    count,
    toggleStarred,
    drop,
    modal,
    sizeAsset,
    setBaseId,
    setDesignId,
  } = state;
  const room = state.room!;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      if (modal || sizeAsset || locked) return;
      const el = e.target;
      if (
        el instanceof HTMLElement &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.tagName === "SELECT" ||
          el.isContentEditable)
      )
        return;
      const next = stepPhoto(photos, base?.id || "", e.key === "ArrowRight" ? 1 : -1);
      if (!next) return;
      e.preventDefault();
      setBaseId(next.id);
      setDesignId("");
      setView("photo");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [photos, base, modal, sizeAsset, locked, setBaseId, setDesignId, setView]);
  return (
    <section className="stage">
      <div className="stage-bar">
        {design ? (
          <div className="segmented" role="group" aria-label="View">
            {(["photo", "design", "compare"] as const).map((v) => (
              <button
                key={v}
                aria-pressed={shown === v}
                disabled={v === "compare" && !before}
                onClick={() => setView(v)}
              >
                {v === "photo" ? "Photo" : v === "design" ? "Design" : "Compare"}
              </button>
            ))}
          </div>
        ) : (
          <span className="muted small">
            {photos.length
              ? `${photos.length} photo${photos.length > 1 ? "s" : ""}`
              : "No photos yet"}
          </span>
        )}
        {active && (
          <span className="stage-actions">
            <button
              className="icon-button"
              aria-pressed={!!active.starred}
              aria-label={active.starred ? `Unsave ${active.mode || "this"} design` : "Save design"}
              title={active.starred ? "Unsave design" : "Save design"}
              disabled={locked}
              onClick={() => void toggleStarred(active.id)}
            >
              <Star size={16} className={active.starred ? "star-on" : undefined} />
            </button>
            <a
              className="icon-button"
              href={assetUrl(active.key)}
              download={`${room.name}-roomform.png`}
              aria-label="Download design"
              title="Download"
            >
              <Download size={16} />
            </a>
          </span>
        )}
      </div>
      <div
        className={`canvas${dragging ? " dragging" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={drop}
      >
        {shown === "compare" && design && before ? (
          <>
            <img src={assetUrl(before.key)} alt="Original photo" />
            <div className="after" style={{ clipPath: `inset(0 0 0 ${split}%)` }}>
              <img src={assetUrl(design.key)} alt="Design" />
            </div>
            <div className="split-line" style={{ left: `${split}%` }}>
              <span>
                <MoveHorizontal size={16} />
              </span>
            </div>
            <input
              className="split-input"
              type="range"
              min="0"
              max="100"
              value={split}
              aria-label="Compare original and design"
              onChange={(e) => setSplit(Number(e.target.value))}
            />
            <span className="tag left">Before</span>
            <span className="tag right">After</span>
          </>
        ) : active ? (
          <img src={assetUrl(active.key)} alt="Design" />
        ) : base ? (
          <img src={assetUrl(base.key)} alt={base.name} />
        ) : (
          <div className="dropzone">
            <ImagePlus size={28} strokeWidth={1.5} />
            <p>Drop room photos here</p>
            <button className="button" disabled={locked} onClick={() => input.current?.click()}>
              Choose photos
            </button>
            <small className="muted">JPG, PNG or WebP</small>
          </div>
        )}
        {generating && (
          <div className="overlay">
            <LoaderCircle className="spin" size={22} />
            <p>Generating…</p>
            <small>
              {count > 1
                ? `${count} designs — this can take a few minutes.`
                : "This can take a few minutes."}
            </small>
          </div>
        )}
      </div>
      {active?.plan && (
        <details className="plan">
          <summary>Layout plan</summary>
          <p>{active.plan}</p>
        </details>
      )}
      <Filmstrips state={state} />
    </section>
  );
}
