import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import css from "../styles.css?url";
import icon from "../../assets/icon.svg?url";
export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Roomform" },
    ],
    links: [
      { rel: "stylesheet", href: css },
      { rel: "icon", type: "image/svg+xml", href: icon },
    ],
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
