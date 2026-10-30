import { z } from "zod";

const distance = z.number().min(0).max(30);
const extent = z.number().min(0.1).max(15);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const evidence = {
  support: z.enum(["visible", "inferred"]),
  photoNumbers: z.array(z.number().int().min(1).max(8)).max(8),
};
export const aiRoomLayoutInput = z.object({
  summary: z.string().min(1).max(500),
  assumptions: z.array(z.string().min(1).max(250)).max(8),
  footprint: z
    .array(z.object({ x: distance, z: distance }))
    .min(3)
    .max(12),
  ceilingHeight: z.number().min(1.8).max(6),
  floorColor: color,
  walls: z
    .array(
      z.object({
        edgeIndex: z.number().int().min(0).max(11),
        label: z.string().min(1).max(80),
        color,
        ...evidence,
        openings: z
          .array(
            z.object({
              kind: z.enum(["window", "door", "passage"]),
              center: z.number().min(0).max(1),
              width: extent,
              bottom: z.number().min(0).max(5),
              height: z.number().min(0.2).max(6),
              ...evidence,
            }),
          )
          .max(6),
      }),
    )
    .min(3)
    .max(12),
  fixtures: z
    .array(
      z.object({
        label: z.string().min(1).max(80),
        kind: z.enum([
          "cabinet",
          "island",
          "refrigerator",
          "range",
          "sink",
          "stairs",
          "sofa",
          "bed",
          "table",
          "other",
        ]),
        x: distance,
        z: distance,
        bottom: z.number().min(0).max(5),
        width: extent,
        depth: extent,
        height: extent,
        yawDegrees: z.number().min(-180).max(180),
        color,
        ...evidence,
      }),
    )
    .max(40),
});
/** Stored plan coordinates: +x is right when facing +z; convert before Three.js rendering. */
export type AiRoomLayout = z.infer<typeof aiRoomLayoutInput>;

export function footprintArea(points: AiRoomLayout["footprint"]) {
  return (
    points.reduce((sum, point, i) => {
      const next = points[(i + 1) % points.length];
      return sum + point.x * next.z - next.x * point.z;
    }, 0) / 2
  );
}

/** Validate references and topology beyond the provider's JSON-schema checks. */
export function validateAiRoomLayout(value: unknown, photoCount: number): AiRoomLayout {
  const layout = aiRoomLayoutInput.parse(value);
  const points = layout.footprint;
  if (Math.abs(footprintArea(points)) < 1)
    throw new Error(
      "The AI layout has an invalid floor outline. Try another build with clearer room views.",
    );
  const cross = (a: (typeof points)[number], b: typeof a, c: typeof a) =>
    (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
  const between = (x: number, a: number, b: number) =>
    x >= Math.min(a, b) - 1e-8 && x <= Math.max(a, b) + 1e-8;
  const onSegment = (a: (typeof points)[number], b: typeof a, p: typeof a) =>
    Math.abs(cross(a, b, p)) < 1e-8 && between(p.x, a.x, b.x) && between(p.z, a.z, b.z);
  for (let i = 0; i < points.length; i++) {
    const a = points[i],
      b = points[(i + 1) % points.length];
    if (Math.hypot(b.x - a.x, b.z - a.z) < 0.1)
      throw new Error("The AI layout contains a collapsed wall.");
    for (let j = i + 1; j < points.length; j++) {
      if (j === i + 1 || (i === 0 && j === points.length - 1)) continue;
      const c = points[j],
        d = points[(j + 1) % points.length];
      if (
        (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) ||
        onSegment(a, b, c) ||
        onSegment(a, b, d) ||
        onSegment(c, d, a) ||
        onSegment(c, d, b)
      )
        throw new Error("The AI layout has intersecting walls. Try again with clearer room views.");
    }
  }
  if (
    layout.walls.length !== points.length ||
    new Set(layout.walls.map((wall) => wall.edgeIndex)).size !== points.length
  )
    throw new Error("The AI layout did not describe each wall exactly once.");
  const supports = [
    ...layout.walls,
    ...layout.walls.flatMap((wall) => wall.openings),
    ...layout.fixtures,
  ];
  if (
    supports.some(
      (item) =>
        item.photoNumbers.some((n) => n > photoCount) ||
        (item.support === "visible" && !item.photoNumbers.length),
    )
  )
    throw new Error("The AI layout referenced a photo that was not provided.");
  for (const wall of layout.walls) {
    const a = points[wall.edgeIndex],
      b = points[(wall.edgeIndex + 1) % points.length];
    if (!a || !b) throw new Error("The AI layout referenced an unknown wall.");
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    for (const opening of wall.openings) {
      if (
        opening.center * length - opening.width / 2 < -0.02 ||
        opening.center * length + opening.width / 2 > length + 0.02 ||
        opening.bottom + opening.height > layout.ceilingHeight + 0.02
      )
        throw new Error("An AI-estimated opening does not fit its wall. Try another build.");
    }
  }
  return layout;
}
