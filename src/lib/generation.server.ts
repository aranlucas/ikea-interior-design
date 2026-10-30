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

import type { z } from "zod";
export async function startGeneration(owner: string, input: z.infer<typeof designInput>) {
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
  let prompt = buildPrompt(
    room.type === "Other" ? "a room" : `a ${room.type.toLowerCase()}`,
    input,
    refs,
    context.length + 1,
  );
  if (previous) {
    const bytes = await load(previous.key);
    if (bytes) {
      images.push(bytes);
      prompt += ` The final image is the previous design. Refine that design using the client brief, while keeping image 1 as the architectural authority.`;
    }
  }
  if (input.fillGaps) {
    prompt +=
      " This is an optional AI finish of a partial photo reconstruction. Keep all architecture and contents visible in the original photos consistent across views. Fill visual gaps conservatively without claiming that inferred areas were observed or measured. Produce a single finished room image; this output does not add measured geometry to the 3D reconstruction.";
  }
  if (!claimGeneration(u.sub))
    throw new Error("A design is already being generated. Please wait for it to finish.");
  let job;
  try {
    await mutateRooms(u.sub, (latest) => {
      const target = latest.find((r) => r.id === room.id);
      if (!target) throw new Error("Room was removed before generation started.");
      target.notes = input.notes;
      target.style = input.style;
    });
    job = createJob(u.sub, room.id);
  } catch (error) {
    releaseGeneration(u.sub);
    throw error;
  }
  void settleGeneration(u.sub, job.id, async () => {
    if (!(await rooms(u.sub)).some((r) => r.id === room.id))
      throw new Error("Room was removed before generation started.");
    const provider = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const result = await generateImage({
      model: provider.image(process.env.OPENAI_IMAGE_MODEL || "gpt-image-2.5-sunburst"),
      prompt: { text: prompt, images },
      size: outputSize(images[0]),
      n: 1,
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(240_000),
    });
    const id = crypto.randomUUID();
    const key = `${ownerPrefix(u.sub)}${room.id}/${id}.png`;
    await save(key, result.image.uint8Array, "image/png");
    const target = await mutateRooms(u.sub, (latest) => {
      const target = latest.find((r) => r.id === room.id);
      if (!target) throw new Error("Room was removed during generation.");
      target.designs.unshift({
        id,
        key,
        prompt: input.notes,
        createdAt: new Date().toISOString(),
        baseId: base.id,
        inferred: input.fillGaps || undefined,
      });
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
