import { Download, ImagePlus, LoaderCircle, MoveHorizontal } from "lucide-react";
import { assetUrl } from "../lib/types";
import { Filmstrips } from "./filmstrips";
import type { StudioState } from "../hooks/use-studio";
import { lazy, Suspense } from "react";
const RoomPreview = lazy(() => import("./room-preview"));
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
    drop,
  } = state;
  const room = state.room!;
  return (
    <section className="stage">
      <div className="stage-bar">
        {photos.length > 0 ? (
          <div className="segmented" role="group" aria-label="View">
            {(["photo", "room", ...(design ? (["design", "compare"] as const) : [])] as const).map(
              (v) => (
                <button
                  key={v}
                  aria-pressed={shown === v}
                  disabled={v === "compare" && !before}
                  onClick={() => setView(v)}
                >
                  {v === "photo"
                    ? "Photo"
                    : v === "room"
                      ? "3D room"
                      : v === "design"
                        ? "Design"
                        : "Compare"}
                </button>
              ),
            )}
          </div>
        ) : (
          <span className="muted small">
            {photos.length
              ? `${photos.length} photo${photos.length > 1 ? "s" : ""}`
              : "No photos yet"}
          </span>
        )}
        {active && (
          <a
            className="icon-button"
            href={assetUrl(active.key)}
            download={`${room.name}-roomform.png`}
            aria-label="Download design"
            title="Download"
          >
            <Download size={16} />
          </a>
        )}
      </div>
      <div
        className={`canvas${shown === "room" && photos.length ? " room-canvas" : ""}${dragging ? " dragging" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={drop}
      >
        {photos.length > 0 && (
          <div hidden={shown !== "room"} style={{ width: "100%" }}>
            <Suspense
              fallback={
                <div className="dropzone" role="status">
                  <LoaderCircle className="spin" size={22} />
                  Loading 3D room…
                </div>
              }
            >
              <RoomPreview key={room.id} state={state} />
            </Suspense>
          </div>
        )}
        {shown === "room" && photos.length ? null : shown === "compare" && design && before ? (
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
            <small className="muted">
              JPG, PNG or WebP · Preview your room in 3D before generating
            </small>
          </div>
        )}
        {generating && (
          <div className="overlay">
            <LoaderCircle className="spin" size={22} />
            <p>Generating…</p>
            <small>This can take a few minutes.</small>
          </div>
        )}
        {shown === "design" && active?.inferred && (
          <span className="tag right">AI finish · Includes inferred areas</span>
        )}
      </div>
      <Filmstrips state={state} />
    </section>
  );
}
