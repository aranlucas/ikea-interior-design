import { user, devBypass } from "./auth.server";
import { rooms } from "./storage.server";

export async function readStudio(request: Request) {
  const identity = await user(request);
  return {
    session: {
      user: identity,
      local: devBypass(),
      authConfigured: !!process.env.AUTH_CLIENT_ID,
      generationConfigured: !!process.env.OPENAI_API_KEY,
    },
    rooms: identity ? await rooms(identity.sub) : [],
  };
}

export async function readStudioRooms(request: Request) {
  const identity = await user(request);
  return identity ? rooms(identity.sub) : [];
}
