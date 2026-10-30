import { createFileRoute, redirect } from "@tanstack/react-router";
import { studioKeys } from "../lib/studio-queries";
import { Studio } from "../components/studio";
import type { RoomSummary } from "../lib/types";
export const Route = createFileRoute("/rooms/")({
  loader: ({ context }) => {
    const first = context.queryClient.getQueryData<RoomSummary[]>(studioKeys.rooms())?.[0];
    if (first)
      throw redirect({ to: "/rooms/$roomId", params: { roomId: first.id }, replace: true });
  },
  component: () => <Studio />,
});
