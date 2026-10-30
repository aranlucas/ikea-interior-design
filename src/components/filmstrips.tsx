import { useState } from "react";
import { Plus, Star, X } from "lucide-react";
import { assetUrl } from "../lib/types";
import { accept } from "../lib/studio-client";
import { Strip } from "./studio-controls";
import type { StudioState } from "../hooks/use-studio";
export function Filmstrips({ state }: { state: StudioState }) {
  const {
    photos,
    shown,
    base,
    design,
    locked,
    setBaseId,
    setDesignId,
    setView,
    deleteAsset,
    deleteDesign,
    input,
    active,
    generating,
    upload,
  } = state;
  const room = state.room!;
  const [savedOnly, setSavedOnly] = useState(false);
  const starredCount = room.designs.filter((d) => d.starred).length;
  if (savedOnly && starredCount === 0) setSavedOnly(false);
  const designs = savedOnly ? room.designs.filter((d) => d.starred) : room.designs;
  return (
    <div className="strips">
      <Strip label="Photos">
        {photos.map((a) => (
          <div className="thumb-wrap" key={a.id}>
            <button
              className="thumb"
              aria-pressed={
                (shown === "photo" && base?.id === a.id) ||
                ((shown === "design" || shown === "compare") && !!design && design.baseId === a.id)
              }
              disabled={locked}
              aria-label={`Show ${a.name}`}
              onClick={() => {
                setBaseId(a.id);
                setDesignId("");
                setView("photo");
              }}
            >
              <img src={assetUrl(a.key)} alt="" />
            </button>
            <button
              className="thumb-delete"
              aria-label={`Delete photo ${a.name}`}
              title="Delete photo"
              disabled={locked}
              onClick={() => void deleteAsset(a)}
            >
              <X size={12} />
            </button>
          </div>
        ))}
        <button
          className="thumb add"
          disabled={locked}
          aria-label="Add photos"
          title="Add photos"
          onClick={() => input.current?.click()}
        >
          <Plus size={18} />
        </button>
      </Strip>
      {room.designs.length > 0 && (
        <Strip
          label={savedOnly ? "Saved" : "Designs"}
          action={
            starredCount > 0 || savedOnly ? (
              <button
                className="link-button"
                aria-pressed={savedOnly}
                onClick={() => setSavedOnly((v) => !v)}
              >
                {savedOnly ? "Show all" : `Saved ${starredCount}`}
              </button>
            ) : undefined
          }
        >
          {designs.map((d, i) => (
            <div className="thumb-wrap" key={d.id}>
              <button
                className="thumb"
                aria-pressed={active?.id === d.id}
                disabled={generating}
                aria-label={`Show design ${designs.length - i}`}
                title={d.createdAt}
                onClick={() => {
                  setDesignId(d.id);
                  setBaseId(d.baseId);
                  setView("design");
                }}
              >
                <img src={assetUrl(d.key)} alt="" />
              </button>
              {d.starred && (
                <span className="thumb-star" aria-label="Saved design">
                  <Star size={11} />
                </span>
              )}
              <button
                className="thumb-delete"
                disabled={locked}
                aria-label={`Delete design ${designs.length - i}`}
                title="Delete design"
                onClick={() => void deleteDesign(d.id)}
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </Strip>
      )}
      <input
        hidden
        ref={input}
        type="file"
        accept={accept}
        multiple
        onChange={(e) => {
          void upload(e.target.files, "room");
          e.target.value = "";
        }}
      />
    </div>
  );
}
