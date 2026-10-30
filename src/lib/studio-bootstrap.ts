import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { readStudio, readStudioRooms } from "./studio-bootstrap.server";

export const getStudioBootstrap = createServerFn({ method: "GET" }).handler(async () => {
  setResponseHeader("Cache-Control", "private, no-store");
  return readStudio(getRequest());
});

export const getStudioRooms = createServerFn({ method: "GET" }).handler(async () => {
  setResponseHeader("Cache-Control", "private, no-store");
  return readStudioRooms(getRequest());
});
