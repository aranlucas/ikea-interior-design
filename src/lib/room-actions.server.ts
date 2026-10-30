import { mutateRooms, ownerPrefix, remove } from "./storage.server";
import { roomUpdate } from "./validation";
export async function updateRoom(owner: string, value: unknown) {
  const input = roomUpdate.parse(value);
  return mutateRooms(owner, (all) => {
    const room = all.find((r) => r.id === input.roomId);
    if (!room) throw new Response("Room not found", { status: 404 });
    if ("model" in input) {
      for (const id of Object.values(input.model.walls)) {
        if (id && !room.assets.some((a) => a.id === id && a.kind === "room"))
          throw new Response("Choose a room photo from this room for each wall.", { status: 400 });
      }
      room.model = input.model;
    } else if ("assetId" in input) {
      const asset = room.assets.find((a) => a.id === input.assetId && a.kind !== "room");
      if (!asset) throw new Response("Reference not found", { status: 404 });
      asset.dimensions = input.dimensions;
    } else if ("name" in input) room.name = input.name;
    else {
      room.notes = input.notes;
      room.style = input.style;
    }
    return room;
  });
}
export async function deleteDesign(owner: string, roomId: string, designId: string) {
  return mutateRooms(owner, (all) => {
    const room = all.find((r) => r.id === roomId);
    const design = room?.designs.find((d) => d.id === designId);
    if (!room || !design) throw new Response("Design not found", { status: 404 });
    // Same SQLite transaction removes both the blob and its room record.
    if (design.key.startsWith(ownerPrefix(owner))) remove(design.key);
    room.designs = room.designs.filter((d) => d.id !== designId);
    return room;
  });
}
