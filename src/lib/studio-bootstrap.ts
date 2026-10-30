import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { readStudio, readStudioRooms, readStudioRoom } from "./studio-bootstrap.server";

export const getStudioBootstrap = createServerFn({ method: "GET" }).handler(async () => {
  setResponseHeader("Cache-Control", "private, no-store");
  return readStudio(getRequest());
});

export const getStudioRooms = createServerFn({ method: "GET" }).handler(async () => {
  setResponseHeader("Cache-Control", "private, no-store");
  return readStudioRooms(getRequest());
});

export const getStudioRoom = createServerFn({ method: "GET" })
  .validator((id: unknown) => {
    if (typeof id !== "string") throw new Error("Invalid room ID");
    return id;
  })
  .handler(async ({ data: id }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    return readStudioRoom(getRequest(), id);
  });
