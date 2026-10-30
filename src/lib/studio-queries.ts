import { queryOptions } from "@tanstack/react-query";
import { api, studioUrls, type Session } from "./studio-client";
import { getStudioRooms, getStudioRoom } from "./studio-bootstrap";
import type { GenerationJob, Room } from "./types";

// These endpoints describe the authenticated workspace. Generation is account-wide,
// not per room: the API returns the account's latest job. Logout reloads the app.
export const studioKeys = {
  all: ["studio"] as const,
  session: () => [...studioKeys.all, "session"] as const,
  rooms: () => [...studioKeys.all, "room-summaries"] as const,
  room: (id: string) => [...studioKeys.all, "room", id] as const,
  generation: () => [...studioKeys.all, "generation"] as const,
};

// The route seeds session/rooms; room revalidation uses a cookie-aware server function.
const studioReadOptions = {
  staleTime: Infinity,
  retry: false,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
} as const;

export type GenerationResult = { job: GenerationJob | null; room?: Room };
export const generationInterval = (result: GenerationResult | undefined) =>
  result?.job?.status === "running" ? 3000 : false;

export const sessionOptions = () =>
  queryOptions({
    ...studioReadOptions,
    queryKey: studioKeys.session(),
    queryFn: ({ signal }) => api<Session>(studioUrls.session, { signal }),
  });

// DB requires a concrete queryFn; queryOptions widens that field to optional.
export const roomsOptions = () => ({
  ...studioReadOptions,
  queryKey: studioKeys.rooms(),
  queryFn: () => getStudioRooms(),
});

export const generationOptions = () =>
  queryOptions({
    ...studioReadOptions,
    queryKey: studioKeys.generation(),
    queryFn: ({ signal }) => api<GenerationResult>(studioUrls.generation, { signal }),
    // Generation is deliberately not prefetched or polled on the server.
    enabled: typeof window !== "undefined",
    refetchInterval: (query) => generationInterval(query.state.data),
    refetchIntervalInBackground: true,
  });

export const roomOptions = (id: string) => ({
  ...studioReadOptions,
  queryKey: studioKeys.room(id),
  queryFn: async () => [await getStudioRoom({ data: id })],
});
