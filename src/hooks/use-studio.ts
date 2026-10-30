import { applyWatchedJob } from "../lib/watched-job";
import { generationOptions, sessionOptions } from "../lib/studio-queries";
import { mutateRoom } from "../lib/room-mutation";
import { findProblems, useLiveQuery } from "@tanstack/react-db";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useStudioData } from "../lib/studio-data";
import { useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";
import { useRoomDrafts } from "./use-room-drafts";
import type { Room, Asset } from "../lib/types";
import { api, studioUrls, json, compress, type View, type Mode, type People, type Lighting } from "../lib/studio-client";
export function useStudio() {
  const { rooms, update, change } = useStudioData();
  const queryClient = useQueryClient();
  const sessionQuery = useQuery(sessionOptions());
  const session = sessionQuery.data;
  const { data: all = [], health } = useLiveQuery({
    query: (q) =>
      session?.user && typeof window !== "undefined"
        ? q.from({ room: rooms }).orderBy(({ room }) => room.createdAt, "desc")
        : undefined,
  });
  const [chosenRoomId, chooseRoom] = useState<string>();
  const roomId = chosenRoomId ?? all[0]?.id ?? "";
  const setRoomId = (id: string) => chooseRoom(id);
  const [modal, setModal] = useState<"room" | "reference" | "rename" | null>(null);
  const [sizeAsset, setSizeAsset] = useState<Asset | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [starting, setStarting] = useState(false);

  // Only the job this tab watched running may update the view or report an error.
  const watching = useRef<string | undefined>(undefined);

  const [baseId, setBaseId] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [designId, setDesignId] = useState("");
  const [view, setView] = useState<View>("design");
  const [split, setSplit] = useState(50);
  const [refine, setRefine] = useState(false);
  const [mode, setMode] = useState<Mode>("redesign");
  const [measurements, setMeasurements] = useState("");
  const [count, setCount] = useState<1 | 2 | 4>(1);
  const [people, setPeople] = useState<People>("none");
  const [lighting, setLighting] = useState<Lighting>("natural");
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const room = all.find((r) => r.id === roomId);
  const { notes, style, setNotes, setStyle, saveStatus } = useRoomDrafts(room, setError);
  const jobQuery = useQuery({
    ...generationOptions(),
    enabled: !!session?.user && typeof window !== "undefined",
  });
  const job = jobQuery.data?.job ?? null;
  const currentRoom = useRef(roomId);
  currentRoom.current = roomId;
  useEffect(() => {
    // Synchronize a committed query result with local DB/UI state. No API calls here.
    if (!jobQuery.data) return;
    const result = jobQuery.data;
    void applyWatchedJob(watching, result, {
      update,
      currentRoom: () => currentRoom.current,
      showDesign: (id) => {
        setDesignId(id);
        setView("design");
      },
      onError: setError,
    }).catch((error: unknown) => {
      setError(error instanceof Error ? error.message : "Could not update room.");
    });
  }, [jobQuery.data, update]);
  const generating = starting || (job?.status === "running" && job.roomId === roomId);
  const [selectionRoom, setSelectionRoom] = useState(roomId);
  if (selectionRoom !== roomId) {
    setSelectionRoom(roomId);
    setBaseId(room?.assets.find((a) => a.kind === "room")?.id || "");
    setSelected(room?.assets.filter((a) => a.kind !== "room").map((a) => a.id) || []);
    setMeasurements(room?.measurements || "");
    setMode("redesign");
    setPeople("none");
    setLighting("natural");
    setDesignId("");
    setView("design");
    setRefine(false);
  }
  const roomProblem = health && findProblems(health)[0];
  const roomError = roomProblem && (roomProblem.error || roomProblem.failureReason);
  const queryError = sessionQuery.error || roomError || jobQuery.error;
  const [seenError, setSeenError] = useState<typeof queryError>(null);
  if (queryError && queryError !== seenError) {
    setSeenError(queryError);
    setError(queryError.message);
  }
  const photos = room?.assets.filter((a) => a.kind === "room") || [];
  const refs = room?.assets.filter((a) => a.kind !== "room") || [];
  const base = photos.find((a) => a.id === baseId) || photos[0];
  const design =
    room?.designs.find((d) => d.id === designId) ||
    room?.designs.find((d) => d.baseId === base?.id);
  const shown = design ? view : "photo";
  const active = shown === "photo" ? undefined : design;
  const before = design && photos.find((a) => a.id === design.baseId);
  const locked = busy || starting || job?.status === "running";
  const me = session?.user;
  const signed = !!me;
  if (!active && refine) setRefine(false);
  async function run(task: () => Promise<void>) {
    setError("");
    setBusy(true);
    try {
      await mutateRoom(queryClient, roomId, task);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }
  async function create(type: string) {
    await run(async () => {
      const r = await api<Room>(studioUrls.rooms, json({ type }));
      await update(r);
      setRoomId(r.id);
      setModal(null);
    });
  }
  async function upload(
    files: FileList | File[] | null,
    kind: Asset["kind"],
    name?: string,
    url?: string,
    dimensions?: string,
  ) {
    if (!files?.length || !room) return;
    const id = room.id;
    const uploads = Array.from(files);
    await run(async () => {
      for (const file of uploads) {
        const compressed = await compress(file);
        const data = new FormData();
        data.set("roomId", id);
        data.set("file", compressed);
        data.set("kind", kind);
        data.set("name", name || file.name.replace(/\.[^.]+$/, ""));
        if (url) data.set("url", url);
        if (dimensions) data.set("dimensions", dimensions);
        const r = await api<Room>(studioUrls.rooms, { method: "PATCH", body: data });
        await update(r);
        if (kind !== "room") setSelected((p) => [...p, r.assets[r.assets.length - 1].id]);
        else setBaseId((p) => p || r.assets.find((a) => a.kind === "room")?.id || "");
      }
      setModal(null);
    });
  }
  async function reference(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const file = data.get("file");
    const fields = [
      String(data.get("kind")) as Asset["kind"],
      String(data.get("name") || ""),
      String(data.get("url") || ""),
      String(data.get("dimensions") || ""),
    ] as const;
    if (file instanceof File && file.size) {
      await upload([file], ...fields);
      return;
    }
    await run(async () => {
      const r = await api<Room>(
        studioUrls.importReference,
        json({
          roomId: room?.id,
          url: data.get("url"),
          name: data.get("name"),
          kind: data.get("kind"),
          dimensions: data.get("dimensions"),
        }),
      );
      await update(r);
      setSelected((p) => [...p, r.assets[r.assets.length - 1].id]);
      setModal(null);
    });
  }
  async function saveSize(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!room || !sizeAsset) return;
    const data = new FormData(e.currentTarget);
    await run(async () => {
      const r = await api<Room>(studioUrls.rooms, {
        ...json({ roomId: room.id, assetId: sizeAsset.id, dimensions: data.get("dimensions") }),
        method: "PUT",
      });
      await update(r);
      setSizeAsset(null);
    });
  }
  async function renameRoom(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!room) return;
    const name = String(new FormData(e.currentTarget).get("name") || "").trim();
    await run(async () => {
      await change(
        async () => {
          await update(
            await api<Room>(studioUrls.rooms, {
              ...json({ roomId: room.id, name }),
              method: "PUT",
            }),
          );
        },
        () =>
          rooms.update(room.id, (draft) => {
            draft.name = name;
          }),
      );
      setModal(null);
    });
  }
  async function deleteDesign(id: string) {
    if (!room || !window.confirm("Delete this design? This permanently deletes its image.")) return;
    await run(async () => {
      await change(
        async () => {
          await update(
            await api<Room>(studioUrls.rooms, {
              ...json({ roomId: room.id, designId: id }),
              method: "DELETE",
            }),
          );
        },
        () =>
          rooms.update(room.id, (draft) => {
            draft.designs = draft.designs.filter((d) => d.id !== id);
          }),
      );
      if (design?.id === id) {
        setDesignId("");
        setView("design");
      }
    });
  }
  async function deleteCurrentRoom() {
    if (
      !room ||
      !window.confirm(
        `Delete “${room.name}”? This permanently deletes its photos, references, and designs.`,
      )
    )
      return;
    const id = room.id;
    await run(async () => {
      await change(
        async () => {
          await api<{ deletedRoomId: string }>(studioUrls.rooms, {
            ...json({ roomId: id }),
            method: "DELETE",
          });
          await rooms.utils.writeDelete(id);
        },
        () => rooms.delete(id),
      );
      setRoomId(all.find((r) => r.id !== id)?.id || "");
      setModal(null);
    });
  }
  async function deleteAsset(asset: Asset) {
    if (!room) return;
    await run(async () => {
      let r: Room = room;
      await change(
        async () => {
          r = await api<Room>(studioUrls.rooms, {
            ...json({ roomId: room.id, assetId: asset.id }),
            method: "DELETE",
          });
          await update(r);
        },
        () =>
          rooms.update(room.id, (draft) => {
            draft.assets = draft.assets.filter((a) => a.id !== asset.id);
          }),
      );
      setSelected((ids) => ids.filter((id) => id !== asset.id));
      if (asset.kind === "room") {
        setBaseId((id) =>
          id === asset.id ? r.assets.find((a) => a.kind === "room")?.id || "" : id,
        );
        setDesignId("");
        setView("design");
      }
    });
  }
  const generationMutation = useMutation({
    mutationFn: (body: unknown) => api<{ jobId: string }>(studioUrls.generation, json(body)),
  });
  async function generate() {
    if (!room || !base) return;
    setStarting(true);
    setError("");
    try {
      await queryClient.cancelQueries({ queryKey: generationOptions().queryKey });
      const r = await generationMutation.mutateAsync({
        roomId: room.id,
        baseId: base.id,
        notes,
        style,
        assetIds: selected,
        previousDesignId: refine ? active?.id : undefined,
        mode,
        count,
        measurements,
        people,
        lighting,
      });
      watching.current = r.jobId;
      queryClient.setQueryData(generationOptions().queryKey, {
        job: {
          id: r.jobId,
          owner: "",
          roomId: room.id,
          status: "running",
          error: null,
          designId: null,
          createdAt: "",
          updatedAt: "",
        },
      });
      await queryClient.invalidateQueries({ queryKey: generationOptions().queryKey });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed.");
    } finally {
      setStarting(false);
    }
  }
  async function toggleStarred(designId: string) {
    if (!room) return;
    const starred = !room.designs.find((d) => d.id === designId)?.starred;
    await run(async () => {
      await change(
        async () => {
          await update(
            await api<Room>("/api/rooms", {
              ...json({ roomId: room.id, designId, starred }),
              method: "PUT",
            }),
          );
        },
        () =>
          rooms.update(room.id, (draft) => {
            const design = draft.designs.find((d) => d.id === designId);
            if (design) design.starred = starred;
          }),
      );
    });
  }
  function drop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (!locked) void upload(e.dataTransfer.files, "room");
  }

  return {
    session,
    all,
    roomId,
    setRoomId,
    modal,
    setModal,
    sizeAsset,
    setSizeAsset,
    error,
    setError,
    busy,
    setBusy,
    starting,
    setStarting,
    job,
    generating,
    baseId,
    setBaseId,
    selected,
    setSelected,
    notes,
    setNotes,
    style,
    setStyle,
    designId,
    setDesignId,
    view,
    setView,
    split,
    setSplit,
    refine,
    setRefine,
    mode,
    setMode,
    measurements,
    setMeasurements,
    count,
    setCount,
    people,
    setPeople,
    lighting,
    setLighting,
    toggleStarred,
    dragging,
    setDragging,
    input,
    room,
    photos,
    refs,
    base,
    design,
    shown,
    active,
    before,
    locked,
    me,
    signed,
    update,
    run,
    create,
    upload,
    reference,
    saveStatus,
    renameRoom,
    deleteDesign,
    saveSize,
    deleteCurrentRoom,
    deleteAsset,
    generate,
    drop,
  };
}
export type StudioState = ReturnType<typeof useStudio>;
