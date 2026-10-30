import { createFileRoute } from "@tanstack/react-router";
import { login, callback, setCookie, sameOrigin } from "../../../lib/auth.server";
import { handle } from "../../../lib/http.server";
export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }) =>
        handle(async () => {
          const path = new URL(request.url).pathname;
          if (path.endsWith("/login")) return login();
          if (path.endsWith("/callback")) return callback(request);
          return new Response("Not found", { status: 404 });
        }),
      POST: ({ request }) =>
        handle(async () => {
          sameOrigin(request);
          if (!new URL(request.url).pathname.endsWith("/logout"))
            return new Response("Not found", { status: 404 });
          return new Response(null, {
            status: 200,
            headers: { "Set-Cookie": setCookie("roomform_session", "", 0) },
          });
        }),
    },
  },
});
