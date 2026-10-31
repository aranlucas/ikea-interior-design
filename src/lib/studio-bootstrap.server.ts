import { ENV } from "varlock/env";
import { defaultImageModel } from "./image-settings";
import { user, devBypass } from "./auth.server";
import { rooms } from "./storage.server";

export async function readStudio(request: Request) {
  const identity = await user(request);
  return {
    session: {
      user: identity,
      local: devBypass(),
      authConfigured: !!ENV.AUTH_CLIENT_ID,
      generationConfigured: !!ENV.OPENAI_API_KEY,
      imageModel: ENV.OPENAI_IMAGE_MODEL || defaultImageModel,
    },
    rooms: identity ? (await rooms(identity.sub)).map(roomSummary) : [],
  };
}

export async function readStudioRooms(request: Request) {
  const identity = await user(request);
  return identity ? (await rooms(identity.sub)).map(roomSummary) : [];
}

export function roomSummary({
  id,
  name,
  type,
  createdAt,
}: import("./types").Room): import("./types").RoomSummary {
  return { id, name, type, createdAt };
}
export async function readStudioRoom(request: Request, id: string) {
  const identity = await user(request);
  const room = identity && (await rooms(identity.sub)).find((room) => room.id === id);
  if (!room) throw new Response("Room not found", { status: 404 });
  return room;
}
