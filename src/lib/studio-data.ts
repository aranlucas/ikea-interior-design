import { collectionOptions, createTransaction, DbClient } from "@tanstack/react-db";
import { QueryClient } from "@tanstack/react-query";
import { queryCollectionOptions } from "@tanstack/query-db-collection";
import { createContext, useContext } from "react";
import { roomsOptions } from "./studio-queries";
import type { Room } from "./types";

export function createStudioData(queryClient: QueryClient) {
  const db = new DbClient();
  const rooms = db.collection(
    collectionOptions(
      queryCollectionOptions({
        id: "rooms",
        ...roomsOptions(),
        queryClient,
        getKey: (room) => room.id,
      }),
    ),
  );
  async function change(task: () => Promise<unknown>, optimistic: () => void) {
    // The task must write confirmed server data before the optimistic layer is removed.
    const tx = createTransaction({ mutationFn: task });
    tx.mutate(optimistic);
    await tx.when("settled");
  }
  return { rooms, change, update: (room: Room) => rooms.utils.writeUpsert(room) };
}
export type StudioData = ReturnType<typeof createStudioData>;
export const StudioDataContext = createContext<StudioData | null>(null);
export function useStudioData() {
  const data = useContext(StudioDataContext);
  if (!data) throw new Error("Studio data provider missing");
  return data;
}
