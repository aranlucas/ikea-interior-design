import { collectionOptions, createTransaction, DbClient } from "@tanstack/react-db";
import { QueryClient } from "@tanstack/react-query";
import { queryCollectionOptions } from "@tanstack/query-db-collection";
import { createContext, useContext } from "react";
import { api } from "./studio-client";
import type { Room } from "./types";

export function createStudioData(queryClient: QueryClient) {
  const db = new DbClient();
  const rooms = db.collection(
    collectionOptions(
      queryCollectionOptions({
        id: "rooms",
        queryKey: ["rooms"],
        queryClient,
        queryFn: () => api<Room[]>("/api/rooms"),
        getKey: (room) => room.id,
        enabled: typeof window !== "undefined",
        staleTime: Infinity,
        retry: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
      }),
    ),
  );
  async function change(task: () => Promise<unknown>, optimistic: () => void) {
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
