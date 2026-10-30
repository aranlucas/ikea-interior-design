import { useRef, useState } from "react";
import type { Room } from "../lib/types";
import { useStudioData } from "../lib/studio-data";
type Draft = { notes: string; style: string; status: "Saving…" | "Saved" | "" };
export function useRoomDrafts(room: Room | undefined, onError: (message: string) => void) {
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const latest = useRef(drafts);
  const { saveDraft } = useStudioData();
  function edit(field: "notes" | "style", value: string) {
    if (!room) return;
    const id = room.id;
    const draft: Draft = {
      ...(latest.current[id] || { notes: room.notes, style: room.style }),
      [field]: value,
      status: "Saving…",
    };
    latest.current = { ...latest.current, [id]: draft };
    setDrafts(latest.current);
    function finish(status: Draft["status"]) {
      if (latest.current[id] !== draft) return;
      latest.current = { ...latest.current, [id]: { ...draft, status } };
      setDrafts(latest.current);
    }
    try {
      const tx = saveDraft(id, draft);
      void tx.when("settled").then(
        () => finish("Saved"),
        (error: Error) => {
          // Merged calls share a transaction; only its newest draft reports failure.
          if (latest.current[id] !== draft) return;
          onError(error.message || "Could not save room.");
          finish("");
        },
      );
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not save room.");
      finish("");
    }
  }
  return {
    notes: room ? (drafts[room.id]?.notes ?? room.notes) : "",
    style: room ? (drafts[room.id]?.style ?? room.style) : "",
    saveStatus: room ? drafts[room.id]?.status || "" : "",
    setNotes: (value: string) => edit("notes", value),
    setStyle: (value: string) => edit("style", value),
  };
}
