import { z } from "zod";
import type { Asset, ReconstructionResult } from "./types";
import type { AiRoomLayout } from "./ai-room-layout";

const coordinate = z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]);
export const photoMatchesInput = z
  .object({
    aId: z.uuid(),
    bId: z.uuid(),
    points: z
      .array(z.object({ a: coordinate, b: coordinate }))
      .min(12)
      .max(64),
  })
  .refine((value) => value.aId !== value.bId, "Choose two different photos.")
  .refine(
    (value) =>
      (["a", "b"] as const).every(
        (side) => new Set(value.points.map((p) => p[side].join(":"))).size === value.points.length,
      ),
    "Mark different details for each match.",
  );
export const reconstructionInput = z.object({
  roomId: z.uuid(),
  mode: z.enum(["classical", "ai-layout"]).default("classical"),
  matches: photoMatchesInput.optional(),
});
export type PhotoMatches = z.infer<typeof photoMatchesInput>;
export type RecoveredCamera = {
  assetId: string;
  position: [number, number, number];
  rotation: [number, number, number, number];
  width: number;
  height: number;
  fx: number;
  fy: number;
  cx: number;
  cy: number;
};
export type ReconstructedScene = {
  version: 1;
  kind: "sparse" | "ai-layout";
  positions: number[];
  colors: number[];
  cameras: RecoveredCamera[];
  layout?: AiRoomLayout;
  sourcePhotoIds?: string[];
  model?: string;
};
export function reconstructionIsCurrent(result: ReconstructionResult, photos: Asset[]) {
  return (
    result.photoIds.length === photos.length &&
    result.photoIds.every((id) => photos.some((p) => p.id === id))
  );
}
