import { createFileRoute, Outlet } from "@tanstack/react-router";
import { HydrationBoundary } from "@tanstack/react-db";
import { getStudioBootstrap } from "../lib/studio-bootstrap";
import { preloadStudio } from "../lib/studio-data";
import { studioKeys } from "../lib/studio-queries";
import { StudioFeedback } from "../lib/studio-feedback";
export const Route = createFileRoute("/rooms")({
  headers: () => ({ "Cache-Control": "private, no-store" }),
  beforeLoad: async ({ context }) => {
    if (!context.queryClient.getQueryData(studioKeys.session())) {
      await preloadStudio(context.queryClient, context.studioData, await getStudioBootstrap());
    }
  },
  loader: ({ context }) => ({ dbState: context.studioData.db.dehydrate() }),
  component: RoomsLayout,
});
function RoomsLayout() {
  const { dbState } = Route.useLoaderData();
  return (
    <HydrationBoundary state={dbState}>
      <StudioFeedback>
        <Outlet />
      </StudioFeedback>
    </HydrationBoundary>
  );
}
