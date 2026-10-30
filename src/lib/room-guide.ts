import { z } from "zod";
import type { AiRoomLayout } from "./ai-room-layout";

const vector = z.tuple([
  z.number().min(-1000).max(1000),
  z.number().min(-1000).max(1000),
  z.number().min(-1000).max(1000),
]);
export const roomGuideInput = z.object({
  resultId: z.uuid(),
  image: z
    .string()
    .max(3_400_000)
    .regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/),
  camera: z
    .object({
      position: vector,
      target: vector,
      fov: z.number().min(10).max(100),
      aspect: z.number().min(0.25).max(4),
    })
    .refine(
      (camera) => Math.hypot(...camera.position.map((n, i) => n - camera.target[i])) > 0.01,
      "Choose a valid camera view.",
    ),
  showInferred: z.boolean(),
  showFixtures: z.boolean(),
});
export type RoomGuide = z.infer<typeof roomGuideInput>;
export type RoomGuideConstraints = {
  layout: AiRoomLayout;
  capture: Omit<RoomGuide, "image">;
};
