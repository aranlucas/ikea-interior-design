import type { Room } from "./types";
import type { RoomGuide } from "./room-guide";
import type { ReconstructedScene } from "./reconstruction";
import { reconstructionIsCurrent } from "./reconstruction";
import { validateAiRoomLayout } from "./ai-room-layout";
import { jpegDimensions } from "./image-size";
import { load, ownerPrefix } from "./storage.server";

export function assertCurrentGuide(room: Room, resultId: string) {
  const result = room.reconstruction?.result;
  if (!result || result.id !== resultId || result.kind !== "ai-layout")
    throw new Response("That AI layout is no longer available. Refresh and capture a new view.", {
      status: 409,
    });
  if (
    room.reconstruction?.status === "running" ||
    !reconstructionIsCurrent(
      result,
      room.assets.filter((asset) => asset.kind === "room"),
    )
  )
    throw new Response("The room photos or layout have changed. Rebuild and capture a new view.", {
      status: 409,
    });
  return result;
}

export async function prepareRoomGuide(owner: string, room: Room, guide: RoomGuide) {
  const result = assertCurrentGuide(room, guide.resultId);
  if (!result.key.startsWith(`${ownerPrefix(owner)}${room.id}/`))
    throw new Response("Reconstruction not found", { status: 404 });
  const bytes = await load(result.key);
  if (!bytes) throw new Response("Reconstruction not found", { status: 404 });
  const scene: ReconstructedScene = JSON.parse(Buffer.from(bytes).toString());
  const ids = result.sourcePhotoIds;
  if (
    scene.kind !== "ai-layout" ||
    !ids?.length ||
    ids.length > 8 ||
    new Set(ids).size !== ids.length ||
    JSON.stringify(scene.sourcePhotoIds) !== JSON.stringify(ids)
  )
    throw new Response("Rebuild the AI layout before generating this view.", { status: 409 });
  const photos = ids.map((id) =>
    room.assets.find((asset) => asset.id === id && asset.kind === "room"),
  );
  if (photos.some((photo) => !photo))
    throw new Response("A source photo is no longer available. Rebuild the AI layout.", {
      status: 409,
    });
  const layout = validateAiRoomLayout(scene.layout, ids.length);
  const image = Buffer.from(guide.image.slice("data:image/jpeg;base64,".length), "base64");
  const dimensions = jpegDimensions(image);
  if (
    !dimensions ||
    Math.min(dimensions.width, dimensions.height) < 256 ||
    Math.max(dimensions.width, dimensions.height) > 2048 ||
    Math.abs(dimensions.width / dimensions.height - guide.camera.aspect) > 0.01 ||
    image.at(-2) !== 0xff ||
    image.at(-1) !== 0xd9
  )
    throw new Response("Capture a valid room view before generating.", { status: 400 });
  const { image: _, ...capture } = guide;
  return {
    image,
    photos: photos.filter((photo) => !!photo),
    constraints: { layout, capture },
    // Copy the validated evidence: reconstruction rebuilds can remove the original blob.
    snapshot: JSON.stringify({
      version: 1,
      resultId: result.id,
      model: result.model,
      sourcePhotoIds: ids,
      layout,
    }),
  };
}
