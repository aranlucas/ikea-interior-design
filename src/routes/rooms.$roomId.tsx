import { createFileRoute, notFound, redirect } from "@tanstack/react-router";
import { HydrationBoundary } from "@tanstack/react-db";
import { preloadRoom } from "../lib/studio-data";
import { studioKeys } from "../lib/studio-queries";
import { Studio } from "../components/studio";
import type { Session } from "../lib/studio-client";
import type { RoomSummary } from "../lib/types";
export const Route = createFileRoute("/rooms/$roomId")({
  loader: async ({ context, params }) => {
    const session = context.queryClient.getQueryData<Session>(studioKeys.session());
    if (!session?.user) throw redirect({ to: "/rooms" });
    const summaries = context.queryClient.getQueryData<RoomSummary[]>(studioKeys.rooms()) || [];
    if (!summaries.some((room) => room.id === params.roomId)) throw notFound();
    return { dbState: await preloadRoom(context.queryClient, context.studioData, params.roomId) };
  },
  component: RoomPage,
  notFoundComponent: () => (
    <main className="center">
      <div className="card">
        <h1>Room not found</h1>
        <a href="/rooms">Back to rooms</a>
      </div>
    </main>
  ),
});
function RoomPage() {
  const { roomId } = Route.useParams();
  const { dbState } = Route.useLoaderData();
  return (
    <HydrationBoundary state={dbState}>
      <Studio key={roomId} roomId={roomId} />
    </HydrationBoundary>
  );
}
