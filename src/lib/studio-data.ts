import {
  collectionOptions,
  createTransaction,
  createPacedMutations,
  debounceStrategy,
  type Transaction,
  DbClient,
  type InitialQueryBuilder,
} from "@tanstack/react-db";
import { QueryClient } from "@tanstack/react-query";
import { queryCollectionOptions } from "@tanstack/query-db-collection";
import { createContext, useContext } from "react";
import { roomsOptions, roomOptions, studioKeys } from "./studio-queries";
import { api, json, studioUrls } from "./studio-client";
import { createFormControl } from "react-hook-form";
import type { Room, RoomSummary } from "./types";

export const summariesCollection = collectionOptions("room-summaries", (client) =>
  queryCollectionOptions({
    id: "room-summaries",
    ...roomsOptions(),
    queryClient: client.requireDependency<QueryClient>("queryClient"),
    getKey: (room) => room.id,
  }),
);
export const roomCollection = (id: string) =>
  collectionOptions(`room:${id}`, (client) =>
    queryCollectionOptions({
      id: `room:${id}`,
      ...roomOptions(id),
      queryClient: client.requireDependency<QueryClient>("queryClient"),
      getKey: (room) => room.id,
    }),
  );
export const studioRoomsQuery = {
  queryKey: ["studio", "ordered-room-summaries"] as const,
  query: (q: InitialQueryBuilder) =>
    q.from({ room: summariesCollection }).orderBy(({ room }) => room.createdAt, "desc"),
};
export const studioRoomQuery = (id: string) => ({
  queryKey: ["studio", "selected-room", id] as const,
  query: (q: InitialQueryBuilder) => q.from({ room: roomCollection(id) }).findOne(),
});
export type RoomDraft = Pick<Room, "notes" | "style"> & { status: "Saving…" | "Saved" | "" };

export function createStudioData(queryClient: QueryClient) {
  const db = new DbClient({ queryClient });
  const summaries = db.collection(summariesCollection);
  const getRoom = (id: string) => db.collection(roomCollection(id));
  const forms = new Map<
    string,
    ReturnType<typeof createFormControl<RoomDraft>> & { revision: number }
  >();
  function draftForm(room: Pick<Room, "id" | "notes" | "style">) {
    let form = forms.get(room.id);
    if (!form) {
      form = {
        ...createFormControl<RoomDraft>({
          defaultValues: { notes: room.notes, style: room.style, status: "" },
        }),
        revision: 0,
      };
      forms.set(room.id, form);
    }
    return form;
  }
  const watching = { current: undefined as string | undefined };
  async function change(task: () => Promise<unknown>, optimistic: () => void) {
    // The task must write confirmed server data before the optimistic layer is removed.
    const tx = createTransaction({ mutationFn: task });
    tx.mutate(optimistic);
    await tx.when("settled");
  }
  async function update(room: Room) {
    await getRoom(room.id).utils.writeUpsert(room);
    await summaries.utils.writeUpsert({
      id: room.id,
      name: room.name,
      type: room.type,
      createdAt: room.createdAt,
    });
  }
  const tails = new Map<string, Promise<unknown>>();
  function persist<T>(id: string, task: () => Promise<T>): Promise<T> {
    const next = (tails.get(id) ?? Promise.resolve()).then(task, task);
    tails.set(
      id,
      next.catch(() => {}),
    );
    return next;
  }
  type Draft = Pick<Room, "notes" | "style">;
  const pacers = new Map<
    string,
    {
      mutate: (draft: Draft) => Transaction<Room>;
      latest?: Transaction<Room>;
    }
  >();
  function saveDraft(id: string, draft: Draft) {
    const rooms = getRoom(id);
    let pacer = pacers.get(id);
    if (!pacer) {
      pacer = {
        mutate: createPacedMutations<Draft, Room>({
          strategy: debounceStrategy({ wait: 500 }),
          onMutate: (value) => {
            if (rooms.has(id))
              rooms.update(id, (row) => {
                Object.assign(row, value);
              });
          },
          mutationFn: ({ transaction }) =>
            persist(id, async () => {
              // A delayed receipt must not recreate a room deleted in the meantime.
              if (!rooms.has(id)) return;
              const value = transaction.mutations[0]?.modified;
              if (!value) return;
              await update(
                await api<Room>(studioUrls.rooms, {
                  ...json({ roomId: id, notes: value.notes, style: value.style }),
                  method: "PUT",
                }),
              );
            }),
        }),
      };
      pacers.set(id, pacer);
    }
    const tx = pacer.mutate(draft);
    pacer.latest = tx;
    return tx;
  }
  async function runRoom<T>(id: string, task: () => Promise<T>) {
    // Let admitted saves settle before rename/delete. A failed save rolls back
    // but must not prevent a subsequent explicit operation from proceeding.
    await pacers
      .get(id)
      ?.latest?.when("settled")
      .catch(() => {});
    return persist(id, task);
  }
  return { db, summaries, getRoom, change, update, saveDraft, runRoom, draftForm, watching };
}

export async function preloadStudio(
  queryClient: QueryClient,
  data: StudioData,
  initial: { session: import("./studio-client").Session; rooms: RoomSummary[] },
) {
  queryClient.setQueryData(studioKeys.session(), initial.session);
  if (initial.session.user) {
    queryClient.setQueryData(studioKeys.rooms(), initial.rooms);
    await data.db.preloadLiveQuery(studioRoomsQuery);
  }
  return data.db.dehydrate();
}
export type StudioData = ReturnType<typeof createStudioData>;
export const StudioDataContext = createContext<StudioData | null>(null);
export function useStudioData() {
  const data = useContext(StudioDataContext);
  if (!data) throw new Error("Studio data provider missing");
  return data;
}

export async function preloadRoom(queryClient: QueryClient, data: StudioData, id: string) {
  await queryClient.ensureQueryData(roomOptions(id));
  await data.db.preloadLiveQuery(studioRoomQuery(id));
  return data.db.dehydrate();
}
