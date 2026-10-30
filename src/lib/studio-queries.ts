import { queryOptions } from "@tanstack/react-query";
import { api, studioUrls, type Session } from "./studio-client";
import type { GenerationJob, Room } from "./types";

// These endpoints describe the authenticated workspace. Generation is account-wide,
// not per room: the API returns the account's latest job. Logout reloads the app.
export const studioKeys = {
  all: ["studio"] as const,
  session: () => [...studioKeys.all, "session"] as const,
  rooms: () => [...studioKeys.all, "rooms"] as const,
  generation: () => [...studioKeys.all, "generation"] as const,
  roomMutation: (id: string) => [...studioKeys.all, "room", id] as const,
};

// Studio reads are client-only and refreshed explicitly (generation also polls).
// Keep this policy local so future queries retain Query's normal defaults.
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
    enabled: typeof window !== "undefined",
  });

// DB requires a concrete queryFn; queryOptions widens that field to optional.
export const roomsOptions = () => ({
  ...studioReadOptions,
  queryKey: studioKeys.rooms(),
  queryFn: ({ signal }: { signal: AbortSignal }) => api<Room[]>(studioUrls.rooms, { signal }),
  enabled: typeof window !== "undefined",
});

export const generationOptions = () =>
  queryOptions({
    ...studioReadOptions,
    queryKey: studioKeys.generation(),
    queryFn: ({ signal }) => api<GenerationResult>(studioUrls.generation, { signal }),
    enabled: typeof window !== "undefined",
    refetchInterval: (query) => generationInterval(query.state.data),
    refetchIntervalInBackground: true,
  });
