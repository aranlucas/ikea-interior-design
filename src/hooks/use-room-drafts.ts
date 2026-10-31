import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Room } from "../lib/types";
import { api, json } from "../lib/studio-client";
import { useStudioData } from "../lib/studio-data";
import { defaultImageSettings, type ImageSettings } from "../lib/image-settings";
type Draft = {
  notes: string;
  style: string;
  imageSettings: ImageSettings;
  status: "Saving…" | "Saved" | "Not saved";
};
export function useRoomDrafts(room: Room | undefined, onError: (message: string) => void) {
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const latest = useRef(drafts);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const client = useQueryClient();
  const { rooms, change, update } = useStudioData();
  function edit(changes: Partial<Pick<Draft, "notes" | "style" | "imageSettings">>) {
    if (!room) return;
    const id = room.id;
    const draft: Draft = {
      ...(latest.current[id] || {
        notes: room.notes,
        style: room.style,
        imageSettings: room.imageSettings ?? defaultImageSettings,
      }),
      ...changes,
      status: "Saving…",
    };
    latest.current = { ...latest.current, [id]: draft };
    setDrafts(latest.current);
    clearTimeout(timers.current.get(id));
    timers.current.set(
      id,
      setTimeout(() => {
        timers.current.delete(id);
        // Query's scope serializes requests per room, even across room switches.
        const mutation = client.getMutationCache().build(client, {
          mutationKey: ["room-draft", id],
          scope: { id: `room:${id}` },
          mutationFn: async () => {
            if (!rooms.has(id)) return;
            await change(
              async () => {
                await update(
                  await api<Room>("/api/rooms", {
                    ...json({
                      roomId: id,
                      notes: draft.notes,
                      style: draft.style,
                      imageSettings: draft.imageSettings,
                    }),
                    method: "PUT",
                  }),
                );
              },
              () =>
                rooms.update(id, (value) => {
                  value.notes = draft.notes;
                  value.style = draft.style;
                  value.imageSettings = draft.imageSettings;
                }),
            );
          },
          onSuccess: () => finish("Saved"),
          onError: (error: Error) => {
            onError(error.message || "Could not save room.");
            finish("Not saved");
          },
        });
        function finish(status: Draft["status"]) {
          if (latest.current[id] !== draft) return;
          latest.current = { ...latest.current, [id]: { ...draft, status } };
          setDrafts(latest.current);
        }
        void mutation.execute(undefined).catch(() => {});
      }, 800),
    );
  }
  return {
    notes: room ? (drafts[room.id]?.notes ?? room.notes) : "",
    style: room ? (drafts[room.id]?.style ?? room.style) : "",
    saveStatus: room ? drafts[room.id]?.status || "" : "",
    imageSettings: room
      ? (drafts[room.id]?.imageSettings ?? room.imageSettings ?? defaultImageSettings)
      : defaultImageSettings,
    setNotes: (value: string) => edit({ notes: value }),
    setStyle: (value: string) => edit({ style: value }),
    setImageSettings: (value: ImageSettings) => edit({ imageSettings: value }),
  };
}
