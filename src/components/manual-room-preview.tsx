import { useState, type FormEvent } from "react";
import { ChevronDown, LoaderCircle } from "lucide-react";
import type { StudioState } from "../hooks/use-studio";
import { roomModel, roomModelInput, roomSurfaces } from "../lib/room-model";
import { api, json } from "../lib/studio-client";
import type { Room, RoomModel } from "../lib/types";
import { RoomScene } from "./room-scene";

export default function ManualRoomPreview({ state }: { state: StudioState }) {
  const room = state.room!;
  const initial = roomModel(room.model, room.assets);
  const [dimensions, setDimensions] = useState(() => ({
    width: String(initial.width),
    depth: String(initial.depth),
    height: String(initial.height),
  }));
  const [wallDraft, setWalls] = useState<RoomModel["walls"]>();
  const walls = wallDraft ?? initial.walls;
  const [textures, setTextures] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(room.model ? JSON.stringify(initial) : "");
  const parsed = roomModelInput.safeParse({
    width: Number(dimensions.width),
    depth: Number(dimensions.depth),
    height: Number(dimensions.height),
    walls,
  });
  const model = roomModel(parsed.success ? parsed.data : { ...initial, walls }, room.assets);
  const dirty = JSON.stringify(model) !== saved;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!parsed.success) return;
    setSaving(true);
    await state.run(async () => {
      const result = await api<Room>("/api/rooms", {
        ...json({ roomId: room.id, model }),
        method: "PUT",
      });
      await state.update(result);
      setSaved(JSON.stringify(model));
    });
    setSaving(false);
  }

  return (
    <div className="room-preview">
      <div className="room-preview-heading">
        <div>
          <h2>Manual room layout</h2>
          <p>Set the measurements and match each photo to a wall.</p>
        </div>
        <span className="room-method">No AI</span>
      </div>
      <RoomScene model={model} photos={state.photos} textures={textures} />
      <form className="room-setup" onSubmit={(event) => void save(event)}>
        <fieldset disabled={saving}>
          <legend>Room measurements</legend>
          <p className="room-help">
            {room.model
              ? "Dimensions are entered manually, in meters."
              : "Starter dimensions — replace with your measurements, in meters."}
          </p>
          <div className="room-dimensions">
            {(["width", "depth", "height"] as const).map((dimension) => (
              <label className="field" key={dimension}>
                <span>{dimension[0].toUpperCase() + dimension.slice(1)} (m)</span>
                <input
                  type="number"
                  min={dimension === "height" ? 1.8 : 1}
                  max={dimension === "height" ? 8 : 30}
                  step="0.01"
                  required
                  value={dimensions[dimension]}
                  onChange={(e) =>
                    setDimensions((current) => ({ ...current, [dimension]: e.target.value }))
                  }
                />
              </label>
            ))}
          </div>
          <div className="room-photos-heading">
            <span>Wall photos</span>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={textures}
                onChange={(e) => setTextures(e.target.checked)}
              />
              Show photos
            </label>
          </div>
          <p className="room-help">
            Starts in upload order. Choose a straight-on photo for each wall; photos stretch to fit.
          </p>
          <div className="room-wall-fields">
            {roomSurfaces.map((surface) => (
              <label className="field" key={surface}>
                <span>{surface[0].toUpperCase() + surface.slice(1)} wall</span>
                <div className="select">
                  <select
                    value={model.walls[surface] ?? ""}
                    onChange={(e) => {
                      const next = { ...walls };
                      if (e.target.value) next[surface] = e.target.value;
                      else delete next[surface];
                      setWalls(next);
                    }}
                  >
                    <option value="">Plain wall</option>
                    {state.photos.map((photo) => (
                      <option key={photo.id} value={photo.id}>
                        {photo.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} />
                </div>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="room-save-row">
          <p className="room-help" role="status">
            {saving
              ? "Saving room…"
              : dirty
                ? "Save to keep this room layout."
                : "Room layout saved."}
          </p>
          <button
            className="button"
            type="submit"
            disabled={saving || state.busy || !parsed.success || !dirty}
          >
            {saving && <LoaderCircle size={14} className="spin" />}Save room layout
          </button>
        </div>
      </form>
      <p className="room-disclosure">
        A rectangular room with your photos applied to the walls. Furniture, doors, and windows in
        the photos stay flat; this does not reconstruct their geometry.
      </p>
    </div>
  );
}
