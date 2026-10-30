import { createRootRouteWithContext, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import css from "../styles.css?url";
import type { QueryClient } from "@tanstack/react-query";
import type { StudioData } from "../lib/studio-data";
export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
  studioData: StudioData;
}>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Roomform" },
    ],
    links: [{ rel: "stylesheet", href: css }],
  }),
  component: () => (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <Outlet />
        <Scripts />
      </body>
    </html>
  ),
});
