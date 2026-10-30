import { z } from "zod";
import { scaleNotes } from "./scale";
import { roomModelInput } from "./room-model";
import { roomGuideInput, type RoomGuideConstraints } from "./room-guide";
export const roomInput = z.object({
  name: z.string().trim().max(100).optional(),
  type: z.string().trim().min(1).max(60).default("Living room"),
});
export function roomName(type: string, taken: string[]) {
  let name = type;
  for (let n = 2; taken.includes(name); n++) name = `${type} ${n}`;
  return name;
}
export const designModes = ["redesign", "stage", "empty", "sketch"] as const;
export const peopleOptions = ["none", "man", "woman", "couple", "family", "dog"] as const;
export const lightingOptions = [
  "natural",
  "daylight",
  "golden hour",
  "evening",
  "cozy lamps",
] as const;
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
  people: z.enum(peopleOptions).default("none"),
  lighting: z.enum(lightingOptions).default("natural"),
  fillGaps: z.boolean().optional(),
  roomGuide: roomGuideInput.optional(),
});
export const uuid = z.uuid();

const MODE_DIRECTIVES: Record<(typeof designModes)[number], string> = {
  redesign:
    "Image 1 is the exact camera view to redesign. Preserve its architecture, room dimensions, perspective, windows, doors, ceiling, permanent fixtures, and natural light. Do not invent space or move walls.",
  stage:
    "The room is empty or nearly empty: virtually stage it. Preserve its architecture, room dimensions, perspective, windows, doors, ceiling, permanent fixtures, and natural light, and do not invent space or move walls. Furnish and decorate the space so it feels lived-in and appealing, using the referenced products where provided.",
  empty:
    "Empty the space: remove all furniture, rugs, decor, wall art, and personal items. Keep the architecture, floor and wall finishes, windows, doors, ceiling, built-in and permanent fixtures, and natural light exactly as they are. Return a clean, unfurnished version of the same room from the same camera view.",
  sketch:
    "Image 1 is a sketch, drawing, or 3D-software screenshot rather than a photograph. Turn it into a photorealistic interior: honor the layout, proportions, openings, and fixed elements it depicts, then render believable materials, natural light, soft shadows, and furnishings in the chosen style.",
};
const PEOPLE_PHRASES: Record<(typeof peopleOptions)[number], string> = {
  none: "",
  man: "a man",
  woman: "a woman",
  couple: "a couple",
  family: "a family",
  dog: "a dog",
};

export function buildPrompt(
  roomName: string,
  input: z.infer<typeof designInput>,
  references: { name: string; kind: string; notes?: string; url?: string; dimensions?: string }[],
  roomCount: number,
  plan?: string,
  guide?: RoomGuideConstraints,
) {
  const referenceList = references
    .map(
      (r, i) =>
        `Image ${roomCount + i + 1}: ${r.kind}, ${r.name}. ${r.notes || ""} ${r.url ? `Source label: ${r.url} (do not assume you can browse it).` : ""}`,
    )
    .join("\n");
  const scales = scaleNotes(references, input.measurements);
  const scene = [
    input.people !== "none"
      ? `Naturally include ${PEOPLE_PHRASES[input.people]} in the scene at plausible scale, relaxed and candid.`
      : "",
    input.lighting !== "natural" ? `Lighting direction: ${input.lighting}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
  const parts = [
    `You are an expert interior designer producing a photorealistic visualization of ${roomName}.`,
    guide
      ? `Image 1 is the client's chosen 3D camera/layout guide, a clean render of an AI-estimated room. Keep this exact viewpoint, framing, left/right orientation, footprint, openings, and fixed elements. Preserve the cutaway or overhead composition if shown; do not switch to a source photo's camera. Apply the requested design task: ${input.mode === "empty" ? "remove movable furnishings, retain permanent fixtures" : input.mode === "stage" ? "furnish the empty room" : "create a furnished photorealistic interior"}. The render's simplified colors, amber uncertainty tint, and transparency are diagram conventions, not finishes to reproduce.`
      : MODE_DIRECTIVES[input.mode],
    scene,
    guide
      ? `Images 2 through ${roomCount} are original room photos in the saved layout's source-photo order (photoNumber 1 is image 2). Use them as appearance and evidence for materials, windows, doors, fixtures, and daylight, not as the output camera. Where evidence conflicts with estimated geometry, retain photo-supported details and resolve uncertainty conservatively without inventing observed space.`
      : roomCount > 1
        ? `Additional room images (images 2 through ${roomCount}) show the same room from other angles and are architectural context only.`
        : "",
    input.measurements
      ? `Client-supplied room measurements: ${input.measurements}. These are the physical scale authority for the scene.`
      : "",
    plan
      ? `A prior vision analysis of image 1 produced this placement plan — follow its geometry and placements: ${plan}`
      : "",
    guide
      ? `Saved architectural constraints (AI estimates, NOT measurements): ${JSON.stringify(guide.layout)}. All proportions, positions, and sizes in this layout are estimated, including elements marked visible; visible means photo-supported presence only. Inferred elements and assumptions remain uncertain. Client-supplied measurements override estimated scale. The stored layout uses plan coordinates (+x right facing +z); the render reflects x once into y-up Three.js coordinates and negates fixture yaw. Do not mirror the rendered view. Captured camera in scene coordinates and visibility settings: ${JSON.stringify(guide.capture)}. Hidden inferred structure or fixtures are omitted only from the render, not evidence of absence. Do not fill hidden regions as if observed. This is a separate visualization; it does not update the reconstruction or guarantee exact adherence.`
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
  z.object({ roomId: uuid, model: roomModelInput }),
  z.object({ roomId: uuid, assetId: uuid, dimensions: z.string().trim().max(200) }),
  z.object({ roomId: uuid, notes: z.string().max(4000), style: z.string().max(100) }),
  z.object({ roomId: uuid, name: z.string().trim().min(1).max(100) }),
  z.object({ roomId: uuid, designId: uuid, starred: z.boolean() }),
]);
export const roomDelete = z
  .object({
    roomId: uuid,
    assetId: uuid.optional(),
    designId: uuid.optional(),
  })
  .refine((value) => !(value.assetId && value.designId), "Choose one item to delete.");
