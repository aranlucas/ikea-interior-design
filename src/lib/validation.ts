import { z } from "zod";
import { roomModelInput } from "./room-model";
import { imageSettings } from "./image-settings";
export const roomInput = z.object({
  name: z.string().trim().max(100).optional(),
  type: z.string().trim().min(1).max(60).default("Living room"),
});
export function roomName(type: string, taken: string[]) {
  let name = type;
  for (let n = 2; taken.includes(name); n++) name = `${type} ${n}`;
  return name;
}
export const designInput = z.object({
  roomId: z.uuid(),
  baseId: z.uuid(),
  notes: z.string().max(4000),
  style: z.string().max(100),
  assetIds: z.array(z.uuid()).max(10),
  previousDesignId: z.uuid().optional(),
  fillGaps: z.boolean().optional(),
  imageSettings: imageSettings.optional(),
});
export const uuid = z.uuid();
export function buildPrompt(
  roomName: string,
  input: z.infer<typeof designInput>,
  references: { name: string; kind: string; notes?: string; url?: string; dimensions?: string }[],
  roomCount: number,
) {
  return `You are an expert interior designer producing a photorealistic visualization of ${roomName}. Image 1 is the exact camera view to redesign. Preserve its architecture, room dimensions, perspective, windows, doors, ceiling, permanent fixtures, and natural light. Do not invent space or move walls. Additional room images (images 2 through ${roomCount}) show the same room from other angles and are architectural context only. Later images are furniture/product or style references, in this order: ${references.map((r, i) => `Image ${roomCount + i + 1}: ${r.kind}, ${r.name}. ${r.notes || ""} ${r.dimensions ? `Physical product size: ${r.dimensions}.` : ""} ${r.url ? `Source label: ${r.url} (do not assume you can browse it).` : ""}`).join("\n")}. Reproduce referenced products' recognizable form, color and materials. Use the provided physical sizes to guide their scale and proportions, relative to any known room measurements in the client brief. Client-confirmed physical sizes override size labels in source titles or variant notes. Image pixel dimensions are not physical measurements. If physical sizes or room measurements are missing, estimate conservatively and do not assume exact fit. Place them at plausible scale with realistic shadows and unobstructed circulation. Style direction: ${input.style}. Client brief: ${input.notes || "Create a cohesive, comfortable, thoughtfully furnished interior."}. Return only a polished interior photograph, without text, labels, collage, borders, or a before/after split. This is a design visualization, not a measurement or guarantee of fit.`;
}

export const roomUpdate = z.union([
  z.object({ roomId: uuid, model: roomModelInput }),
  z.object({ roomId: uuid, assetId: uuid, dimensions: z.string().trim().max(200) }),
  z.object({
    roomId: uuid,
    notes: z.string().max(4000),
    style: z.string().max(100),
    imageSettings: imageSettings.optional(),
  }),
  z.object({ roomId: uuid, name: z.string().trim().min(1).max(100) }),
]);
export const roomDelete = z
  .object({
    roomId: uuid,
    assetId: uuid.optional(),
    designId: uuid.optional(),
  })
  .refine((value) => !(value.assetId && value.designId), "Choose one item to delete.");
