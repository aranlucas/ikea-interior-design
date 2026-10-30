import { useEffect, useRef, useState } from "react";
import type { Room } from "../lib/types";
import { api, json } from "../lib/studio-client";
type Draft = { notes: string; style: string; status: "Saving…" | "Saved" | "" };
export function useRoomDrafts(
  room: Room | undefined,
  onSaved: (id: string, notes: string, style: string) => void,
  onError: (message: string) => void,
) {
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const queues = useRef(new Map<string, Promise<void>>());
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  function edit(field: "notes" | "style", value: string) {
    if (!room) return;
    const id = room.id;
    const draft: Draft = {
      ...(drafts[id] || { notes: room.notes, style: room.style }),
      [field]: value,
      status: "Saving…",
    };
    setDrafts((previous) => ({ ...previous, [id]: draft }));
    clearTimeout(timers.current.get(id));
    timers.current.set(
      id,
      setTimeout(() => {
        timers.current.delete(id);
        // Serialize saves per room so a slow older request cannot win over newer text.
        const save = (queues.current.get(id) || Promise.resolve()).then(async () => {
          try {
            await api<Room>("/api/rooms", {
              ...json({ roomId: id, notes: draft.notes, style: draft.style }),
              method: "PUT",
            });
            if (!mounted.current) return;
            onSaved(id, draft.notes, draft.style);
            setDrafts((previous) =>
              previous[id] === draft
                ? { ...previous, [id]: { ...draft, status: "Saved" } }
                : previous,
            );
          } catch (error) {
            if (!mounted.current) return;
            onError(error instanceof Error ? error.message : "Could not save room.");
            setDrafts((previous) =>
              previous[id] === draft ? { ...previous, [id]: { ...draft, status: "" } } : previous,
            );
          }
        });
        queues.current.set(id, save);
      }, 800),
    );
  }
  return {
    notes: room ? (drafts[room.id]?.notes ?? room.notes) : "",
    style: room ? (drafts[room.id]?.style ?? room.style) : "",
    saveStatus: room ? drafts[room.id]?.status || "" : "",
    setNotes: (value: string) => edit("notes", value),
    setStyle: (value: string) => edit("style", value),
  };
}
