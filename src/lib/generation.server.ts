import { createOpenAI } from "@ai-sdk/openai";
import { generateImage } from "ai";
import {
  createJob,
  finishJob,
  rooms,
  mutateRooms,
  claimGeneration,
  releaseGeneration,
  load,
  save,
  ownerPrefix,
} from "./storage.server";
import { designInput, buildPrompt } from "./validation";
import { outputSize } from "./image-size";
import { analyzeLayout } from "./layout.server";

import type { z } from "zod";
function mediaType(key: string) {
  return key.endsWith(".png") ? "image/png" : key.endsWith(".webp") ? "image/webp" : "image/jpeg";
}
export async function startGeneration(owner: string, raw: z.input<typeof designInput>) {
  const input = designInput.parse(raw);
  const u = { sub: owner };
  if (!process.env.OPENAI_API_KEY)
    throw new Error("Add OPENAI_API_KEY to the server environment to generate a design.");
  const all = await rooms(u.sub);
  const room = all.find((r) => r.id === input.roomId);
  if (!room) throw new Response("Room not found", { status: 404 });
  const base = room.assets.find((a) => a.id === input.baseId && a.kind === "room");
  if (!base) throw new Error("Choose a room photo as your base view.");
  const context = room.assets.filter((a) => a.kind === "room" && a.id !== base.id).slice(0, 3);
  const refs = input.assetIds
    .map((id) => room.assets.find((a) => a.id === id && a.kind !== "room"))
    .filter((a) => !!a);
  const previous = input.previousDesignId
    ? room.designs.find((d) => d.id === input.previousDesignId)
    : undefined;
  if (input.previousDesignId && !previous) throw new Error("Previous design not found.");
  const ordered = [base, ...context, ...refs];
  const images = await Promise.all(
    ordered.map(async (a) => {
      const b = await load(a.key);
      if (!b) throw new Error("A reference image is missing. Please upload it again.");
      return b;
    }),
  );
  const count = input.count ?? 1;
  const ttl = count > 1 ? 480_000 : 300_000;
  if (!claimGeneration(u.sub, ttl))
    throw new Error("A design is already being generated. Please wait for it to finish.");
  let job;
  try {
    await mutateRooms(u.sub, (latest) => {
      const target = latest.find((r) => r.id === room.id);
      if (!target) throw new Error("Room was removed before generation started.");
      target.notes = input.notes;
      target.style = input.style;
      target.measurements = input.measurements;
    });
    job = createJob(u.sub, room.id);
  } catch (error) {
    releaseGeneration(u.sub);
    throw error;
  }
  void settleGeneration(u.sub, job.id, async () => {
    if (!(await rooms(u.sub)).some((r) => r.id === room.id))
      throw new Error("Room was removed before generation started.");
    const plan = await analyzeLayout({
      mode: input.mode ?? "redesign",
      baseImage: images[0],
      mediaType: mediaType(base.key),
      roomType: room.type === "Other" ? "room" : room.type.toLowerCase(),
      references: refs.map((r) => ({ name: r.name, kind: r.kind, dimensions: r.dimensions })),
      measurements: input.measurements,
      style: input.style,
      brief: input.notes,
    });
    let prompt = buildPrompt(
      room.type === "Other" ? "a room" : `a ${room.type.toLowerCase()}`,
      input,
      refs,
      context.length + 1,
      plan || undefined,
    );
    if (previous) {
      const bytes = await load(previous.key);
      if (bytes) {
        images.push(bytes);
        prompt += ` The final image is the previous design. Refine that design using the client brief, while keeping image 1 as the architectural authority.`;
      }
    }
    const provider = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const result = await generateImage({
      model: provider.image(process.env.OPENAI_IMAGE_MODEL || "gpt-image-2.5-sunburst"),
      prompt: { text: prompt, images },
      size: outputSize(images[0]),
      n: count,
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(ttl - 30_000),
    });
    const produced = result.images?.length ? result.images : [result.image];
    const createdAt = new Date().toISOString();
    const designs = produced.map(() => {
      const id = crypto.randomUUID();
      return {
        id,
        key: `${ownerPrefix(u.sub)}${room.id}/${id}.png`,
        prompt: input.notes,
        createdAt,
        baseId: base.id,
        plan: plan || undefined,
        mode: input.mode,
      };
    });
    for (const [index, design] of designs.entries())
      await save(design.key, produced[index].uint8Array, "image/png");
    const target = await mutateRooms(u.sub, (latest) => {
      const target = latest.find((r) => r.id === room.id);
      if (!target) throw new Error("Room was removed during generation.");
      target.designs.unshift(...designs);
      return target;
    });
    return target.designs[0].id;
  }).catch((error) => console.error("Could not settle generation job", error));
  return { jobId: job.id };
}
export async function settleGeneration(owner: string, jobId: string, work: () => Promise<string>) {
  try {
    finishJob(owner, jobId, { designId: await work() });
  } catch (error) {
    finishJob(owner, jobId, {
      error: error instanceof Error ? error.message : "Generation failed.",
    });
  } finally {
    releaseGeneration(owner);
  }
}
