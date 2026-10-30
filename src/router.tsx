import { createRouter } from "@tanstack/react-router";
import { DbProvider } from "@tanstack/react-db";
import { QueryClient } from "@tanstack/react-query";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { createStudioData, StudioDataContext } from "./lib/studio-data";
import { routeTree } from "./routeTree.gen";
export function getRouter() {
  const queryClient = new QueryClient();
  const data = createStudioData(queryClient);
  const router = createRouter({
    routeTree,
    context: { queryClient, studioData: data },
    scrollRestoration: true,
    Wrap: ({ children }) => (
      <DbProvider client={data.db}>
        <StudioDataContext.Provider value={data}>{children}</StudioDataContext.Provider>
      </DbProvider>
    ),
  });
  router.serverSsrLifecycle = {
    onServerSsrAttach: [
      (serverSsr) =>
        serverSsr.onCleanup(() => {
          void data.db.cleanup();
        }),
    ],
  };
  setupRouterSsrQueryIntegration({ router, queryClient });
  return router;
}
declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
