import { Dialog, RoomTypes, ReferenceForm } from "./studio-controls";
import type { StudioState } from "../hooks/use-studio";
export function StudioDialogs({ state }: { state: StudioState }) {
  const {
    modal,
    setModal,
    sizeAsset,
    setSizeAsset,
    busy,
    create,
    reference,
    renameRoom,
    saveSize,
  } = state;
  const room = state.room;
  return (
    <>
      {modal === "rename" && room && (
        <Dialog title="Rename room" busy={busy} onClose={() => setModal(null)}>
          <form className="form" onSubmit={renameRoom}>
            <label className="field">
              <span>Name</span>
              <input name="name" defaultValue={room.name} required maxLength={100} autoFocus />
            </label>
            <button className="button primary block" disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </button>
          </form>
        </Dialog>
      )}
      {modal === "room" && (
        <Dialog title="New room" busy={busy} onClose={() => setModal(null)}>
          <RoomTypes busy={busy} onPick={(type) => void create(type)} />
        </Dialog>
      )}
      {modal === "reference" && (
        <Dialog title="Add reference" busy={busy} onClose={() => setModal(null)}>
          <ReferenceForm busy={busy} onSubmit={reference} />
        </Dialog>
      )}
      {sizeAsset && (
        <Dialog title="Product size" busy={busy} onClose={() => setSizeAsset(null)}>
          <form className="form" onSubmit={saveSize}>
            <p className="muted small">{sizeAsset.name}</p>
            <label className="field">
              <span>Dimensions</span>
              <input
                name="dimensions"
                maxLength={200}
                autoFocus
                defaultValue={sizeAsset.dimensions || ""}
                placeholder="e.g. 200 × 90 × 80 cm"
              />
            </label>
            {!!sizeAsset.availableSizes?.length && (
              <div className="chips" aria-label="Sizes listed on the product page">
                {sizeAsset.availableSizes.map((value) => (
                  <button
                    type="button"
                    key={value}
                    onClick={(e) => {
                      const field = e.currentTarget.form?.elements.namedItem("dimensions");
                      if (field instanceof HTMLInputElement) field.value = value;
                    }}
                  >
                    {value}
                  </button>
                ))}
              </div>
            )}
            <p className="hint">Include units. Used as scale guidance.</p>
            <button className="button primary block" disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </button>
          </form>
        </Dialog>
      )}
    </>
  );
}
