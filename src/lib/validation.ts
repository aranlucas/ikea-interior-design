import { z } from "zod";
import { scaleNotes } from "./scale";
export const roomInput = z.object({
  name: z.string().trim().max(100).optional(),
  type: z.string().trim().min(1).max(60).default("Living room"),
});
export function roomName(type: string, taken: string[]) {
  let name = type;
  for (let n = 2; taken.includes(name); n++) name = `${type} ${n}`;
  return name;
}
export const designModes = ["redesign", "stage", "empty"] as const;
export const designInput = z.object({
  roomId: z.uuid(),
  baseId: z.uuid(),
  notes: z.string().max(4000),
  style: z.string().max(100),
  assetIds: z.array(z.uuid()).max(10),
  previousDesignId: z.uuid().optional(),
  mode: z.enum(designModes).default("redesign"),
  count: z.union([z.literal(1), z.literal(2), z.literal(4)]).default(1),
  measurements: z.string().trim().max(200).default(""),
});
export const uuid = z.uuid();

const MODE_DIRECTIVES: Record<(typeof designModes)[number], string> = {
  redesign:
    "Image 1 is the exact camera view to redesign. Preserve its architecture, room dimensions, perspective, windows, doors, ceiling, permanent fixtures, and natural light. Do not invent space or move walls.",
  stage:
    "The room is empty or nearly empty: virtually stage it. Preserve its architecture, room dimensions, perspective, windows, doors, ceiling, permanent fixtures, and natural light, and do not invent space or move walls. Furnish and decorate the space so it feels lived-in and appealing, using the referenced products where provided.",
  empty:
    "Empty the space: remove all furniture, rugs, decor, wall art, and personal items. Keep the architecture, floor and wall finishes, windows, doors, ceiling, built-in and permanent fixtures, and natural light exactly as they are. Return a clean, unfurnished version of the same room from the same camera view.",
};

export function buildPrompt(
  roomName: string,
  input: z.infer<typeof designInput>,
  references: { name: string; kind: string; notes?: string; url?: string; dimensions?: string }[],
  roomCount: number,
  plan?: string,
) {
  const referenceList = references
    .map(
      (r, i) =>
        `Image ${roomCount + i + 1}: ${r.kind}, ${r.name}. ${r.notes || ""} ${r.url ? `Source label: ${r.url} (do not assume you can browse it).` : ""}`,
    )
    .join("\n");
  const scales = scaleNotes(references, input.measurements);
  const parts = [
    `You are an expert interior designer producing a photorealistic visualization of ${roomName}.`,
    MODE_DIRECTIVES[input.mode],
    roomCount > 1
      ? `Additional room images (images 2 through ${roomCount}) show the same room from other angles and are architectural context only.`
      : "",
    input.measurements
      ? `Client-supplied room measurements: ${input.measurements}. These are the physical scale authority for the scene.`
      : "",
    plan
      ? `A prior vision analysis of image 1 produced this placement plan — follow its geometry and placements: ${plan}`
      : "",
    references.length
      ? `Later images are furniture/product or style references, in this order:\n${referenceList}\nReproduce referenced products' recognizable form, color and materials. Respect their physical sizes and place them at plausible scale with realistic shadows and unobstructed circulation.`
      : "",
    scales.length ? `Physical scale guidance:\n${scales.map((s) => `- ${s}`).join("\n")}` : "",
    `Client-confirmed physical sizes override size labels in source titles or variant notes. Image pixel dimensions are not physical measurements. If physical sizes or room measurements are missing, estimate conservatively and do not assume exact fit.`,
    `Style direction: ${input.style}. Client brief: ${input.notes || "Create a cohesive, comfortable, thoughtfully furnished interior."}.`,
    input.mode === "empty"
      ? "Return only a polished photograph of the emptied room, without text, labels, collage, borders, or a before/after split."
      : "Return only a polished interior photograph, without text, labels, collage, borders, or a before/after split.",
    "This is a design visualization, not a measurement or guarantee of fit.",
  ];
  return parts.filter(Boolean).join(" ");
}

export const roomUpdate = z.union([
  z.object({ roomId: uuid, assetId: uuid, dimensions: z.string().trim().max(200) }),
  z.object({ roomId: uuid, notes: z.string().max(4000), style: z.string().max(100) }),
  z.object({ roomId: uuid, name: z.string().trim().min(1).max(100) }),
]);
export const roomDelete = z
  .object({
    roomId: uuid,
    assetId: uuid.optional(),
    designId: uuid.optional(),
  })
  .refine((value) => !(value.assetId && value.designId), "Choose one item to delete.");
