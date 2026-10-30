import { z } from "zod";
import type { Asset, RoomModel } from "./types";

export const roomSurfaces = ["back", "right", "front", "left"] as const;
export const roomModelInput = z.object({
  width: z.number().min(1).max(30),
  depth: z.number().min(1).max(30),
  height: z.number().min(1.8).max(8),
  walls: z.object({
    back: z.uuid().optional(),
    right: z.uuid().optional(),
    front: z.uuid().optional(),
    left: z.uuid().optional(),
  }),
});

// Upload order is just a starting assignment, never an inferred camera position.
export function roomModel(model: RoomModel | undefined, assets: Asset[]): RoomModel {
  const photos = assets.filter((a) => a.kind === "room");
  const walls = model?.walls ?? Object.fromEntries(roomSurfaces.map((s, i) => [s, photos[i]?.id]));
  return {
    width: model?.width ?? 4,
    depth: model?.depth ?? 5,
    height: model?.height ?? 2.7,
    walls: Object.fromEntries(
      roomSurfaces.flatMap((s) => (photos.some((a) => a.id === walls[s]) ? [[s, walls[s]]] : [])),
    ),
  };
}
