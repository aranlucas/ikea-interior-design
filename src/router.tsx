import { createRouter } from "@tanstack/react-router";
import { QueryClient } from "@tanstack/react-query";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { createStudioData, StudioDataContext } from "./lib/studio-data";
import { routeTree } from "./routeTree.gen";
export function getRouter() {
  const queryClient = new QueryClient();
  const data = createStudioData(queryClient);
  const router = createRouter({
    routeTree,
    scrollRestoration: true,
    Wrap: ({ children }) => (
      <StudioDataContext.Provider value={data}>{children}</StudioDataContext.Provider>
    ),
  });
  setupRouterSsrQueryIntegration({ router, queryClient });
  return router;
}
declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
