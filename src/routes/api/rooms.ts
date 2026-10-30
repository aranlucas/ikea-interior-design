import { createFileRoute } from "@tanstack/react-router";
import { requireUser, sameOrigin } from "../../lib/auth.server";
import {
  rooms,
  mutateRooms,
  ownerPrefix,
  save,
  remove,
  deleteRoom,
} from "../../lib/storage.server";
import { handle } from "../../lib/http.server";
import { updateRoom, deleteDesign } from "../../lib/room-actions.server";
import { roomInput, roomName, roomDelete, uuid } from "../../lib/validation";
import type { Asset, Room } from "../../lib/types";
import { roomModel } from "../../lib/room-model";
import { cancelRoomReconstruction } from "../../lib/reconstruction.server";
export const Route = createFileRoute("/api/rooms")({
  server: {
    handlers: {
      GET: ({ request }) =>
        handle(async () =>
          Response.json(await rooms((await requireUser(request)).sub), {
            headers: { "Cache-Control": "no-store" },
          }),
        ),
      POST: ({ request }) =>
        handle(async () => {
          sameOrigin(request);
          const u = await requireUser(request);
          const input = roomInput.parse(await request.json());
          const room = await mutateRooms(u.sub, (all) => {
            const room: Room = {
              id: crypto.randomUUID(),
              name:
                input.name ||
                roomName(
                  input.type,
                  all.map((r) => r.name),
                ),
              type: input.type,
              notes: "",
              style: "Warm minimalism",
              assets: [],
              designs: [],
              createdAt: new Date().toISOString(),
            };
            all.unshift(room);
            return room;
          });
          return Response.json(room);
        }),
      PATCH: ({ request }) =>
        handle(async () => {
          sameOrigin(request);
          const u = await requireUser(request);
          const data = await request.formData();
          const id = uuid.parse(data.get("roomId"));
          const file = data.get("file");
          if (
            !(file instanceof File) ||
            !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
            file.size > 2_500_000 ||
            !file.size
          )
            throw new Error("Upload a JPG, PNG or WebP smaller than 2.5 MB.");
          const kind = String(data.get("kind"));
          if (!["room", "product", "inspiration"].includes(kind))
            throw new Error("Invalid reference type");
          const assetId = crypto.randomUUID();
          const key = `${ownerPrefix(u.sub)}${id}/${assetId}.${file.type.split("/")[1]}`;
          const bytes = new Uint8Array(await file.arrayBuffer());
          const room = await mutateRooms(u.sub, (all) => {
            const room = all.find((r) => r.id === id);
            if (!room) throw new Response("Room not found", { status: 404 });
            if (room.assets.length >= 16)
              throw new Error("A room can hold up to 16 reference photos.");
            room.assets.push({
              id: assetId,
              key,
              name: String(data.get("name") || file.name).slice(0, 120),
              kind: kind as Asset["kind"],
              dimensions: String(data.get("dimensions") || "").slice(0, 200),
              url: safeUrl(String(data.get("url") || "")),
              notes: String(data.get("notes") || "").slice(0, 1000),
            });
            return room;
          });
          await save(key, bytes, file.type);
          return Response.json(room);
        }),
      PUT: ({ request }) =>
        handle(async () => {
          sameOrigin(request);
          const u = await requireUser(request);
          const room = await updateRoom(u.sub, await request.json());
          return Response.json(room);
        }),
      DELETE: ({ request }) =>
        handle(async () => {
          sameOrigin(request);
          const u = await requireUser(request);
          const { roomId, assetId, designId } = roomDelete.parse(await request.json());
          if (designId) return Response.json(await deleteDesign(u.sub, roomId, designId));
          if (assetId === undefined) {
            cancelRoomReconstruction(u.sub, roomId);
            if (!(await deleteRoom(u.sub, roomId)))
              throw new Response("Room not found", { status: 404 });
            return Response.json({ deletedRoomId: roomId });
          }
          uuid.parse(assetId);
          let key: string | undefined;
          const room = await mutateRooms(u.sub, (all) => {
            const room = all.find((r) => r.id === roomId);
            if (!room) throw new Response("Room not found", { status: 404 });
            key = room.assets.find((a) => a.id === assetId)?.key;
            room.assets = room.assets.filter((a) => a.id !== assetId);
            if (room.model) room.model = roomModel(room.model, room.assets);
            return room;
          });
          if (key) await remove(key);
          return Response.json(room);
        }),
    },
  },
});
function safeUrl(value: string) {
  if (!value) return "";
  const u = new URL(value);
  if (!["https:", "http:"].includes(u.protocol))
    throw new Error("Use an HTTP or HTTPS source link.");
  return u.href.slice(0, 2000);
}
