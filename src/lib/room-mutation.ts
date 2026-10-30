import { MutationObserver, type QueryClient } from "@tanstack/react-query";

import { studioKeys } from "./studio-queries";

export async function mutateRoom<T>(client: QueryClient, roomId: string, task: () => Promise<T>) {
  // A fresh observer captures the scope at submission, including debounced saves
  // for rooms that are no longer selected. All room writes share this queue.
  const observer = new MutationObserver(client, {
    mutationKey: studioKeys.roomMutation(roomId),
    scope: { id: `room:${roomId}` },
    mutationFn: task,
  });
  try {
    return await observer.mutate(undefined);
  } finally {
    observer.reset();
  }
}
