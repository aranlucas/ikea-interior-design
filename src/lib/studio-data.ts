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
import { roomsOptions, studioKeys } from "./studio-queries";
import { api, json, studioUrls } from "./studio-client";
import type { Room } from "./types";

export const roomsCollection = collectionOptions("rooms", (client) =>
  queryCollectionOptions({
    id: "rooms",
    ...roomsOptions(),
    queryClient: client.requireDependency<QueryClient>("queryClient"),
    getKey: (room) => room.id,
  }),
);
export const studioRoomsQuery = {
  queryKey: ["studio", "ordered-rooms"] as const,
  query: (q: InitialQueryBuilder) =>
    q.from({ room: roomsCollection }).orderBy(({ room }) => room.createdAt, "desc"),
};

export function createStudioData(queryClient: QueryClient) {
  const db = new DbClient({ queryClient });
  const rooms = db.collection(roomsCollection);
  async function change(task: () => Promise<unknown>, optimistic: () => void) {
    // The task must write confirmed server data before the optimistic layer is removed.
    const tx = createTransaction({ mutationFn: task });
    tx.mutate(optimistic);
    await tx.when("settled");
  }
  const update = (room: Room) => rooms.utils.writeUpsert(room);
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
  return { db, rooms, change, update, saveDraft, runRoom };
}

export async function preloadStudio(
  queryClient: QueryClient,
  data: StudioData,
  initial: { session: import("./studio-client").Session; rooms: Room[] },
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
