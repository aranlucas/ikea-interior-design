import { createFileRoute } from "@tanstack/react-router";
import { user, devBypass } from "../../lib/auth.server";
import { handle } from "../../lib/http.server";
import { defaultImageModel } from "../../lib/image-settings";
export const Route = createFileRoute("/api/session")({
  server: {
    handlers: {
      GET: ({ request }) =>
        handle(async () =>
          Response.json(
            {
              user: await user(request),
              local: devBypass(),
              authConfigured: !!process.env.AUTH_CLIENT_ID,
              generationConfigured: !!process.env.OPENAI_API_KEY,
              imageModel: process.env.OPENAI_IMAGE_MODEL || defaultImageModel,
            },
            { headers: { "Cache-Control": "no-store" } },
          ),
        ),
    },
  },
});
