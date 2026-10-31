import { observeJob } from "../lib/watched-job";
import { useLiveQuery } from "@tanstack/react-db";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useStudioData } from "../lib/studio-data";
import { useRef, useState, type DragEvent, type FormEvent } from "react";
import { useRoomDrafts } from "./use-room-drafts";
import type { Room, Asset, GenerationJob } from "../lib/types";
import { api, json, compress, type Session, type View } from "../lib/studio-client";
export function useStudio() {
  const { rooms, update, change } = useStudioData();
  const queryClient = useQueryClient();
  const sessionQuery = useQuery({
    queryKey: ["session"],
    queryFn: () => api<Session>("/api/session"),
    enabled: typeof window !== "undefined",
    staleTime: Infinity,
  });
  const session = sessionQuery.data;
  const { data: all = [] } = useLiveQuery({
    query: (q) =>
      session?.user && typeof window !== "undefined"
        ? q.from({ room: rooms }).orderBy(({ room }) => room.createdAt, "desc")
        : undefined,
  });
  const roomsQuery = useQuery<Room[]>({
    queryKey: ["rooms"],
    queryFn: () => api<Room[]>("/api/rooms"),
    enabled: false,
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
  const [view, setView] = useState<View>("photo");
  const [split, setSplit] = useState(50);
  const [refine, setRefine] = useState(false);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const room = all.find((r) => r.id === roomId);
  const { notes, style, setNotes, setStyle, saveStatus, imageSettings, setImageSettings } =
    useRoomDrafts(room, setError);
  const jobQuery = useQuery({
    queryKey: ["generation"],
    enabled: !!session?.user && typeof window !== "undefined",
    queryFn: async ({ signal }) => {
      const result = await api<{ job: GenerationJob | null; room?: Room }>("/api/generate", {
        signal,
      });
      const outcome = observeJob(watching.current, result.job);
      watching.current = outcome.watching;
      if (outcome.act && result.job) {
        if (result.room) {
          await update(result.room);
          if (result.room.id === currentRoom.current) {
            setDesignId(result.job.designId || "");
            setView("design");
          }
        }
        if (result.job.status === "failed") setError(result.job.error || "Generation failed.");
      }
      return result;
    },
    refetchInterval: (query) => (query.state.data?.job?.status === "running" ? 3000 : false),
    refetchIntervalInBackground: true,
    staleTime: Infinity,
  });
  const job = jobQuery.data?.job ?? null;
  const currentRoom = useRef(roomId);
  currentRoom.current = roomId;
  const generating = starting || (job?.status === "running" && job.roomId === roomId);
  const [selectionRoom, setSelectionRoom] = useState(roomId);
  if (selectionRoom !== roomId) {
    setSelectionRoom(roomId);
    setBaseId(room?.assets.find((a) => a.kind === "room")?.id || "");
    setSelected(
      room?.assets
        .filter((a) => a.kind !== "room")
        .map((a) => a.id)
        .slice(0, 10) || [],
    );
    setDesignId("");
    setView("photo");
    setRefine(false);
  }
  const queryError = sessionQuery.error || roomsQuery.error || jobQuery.error;
  const [seenError, setSeenError] = useState<Error | null>(null);
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
  const shown = view === "room" ? "room" : design ? view : "photo";
  const active = shown === "design" || shown === "compare" ? design : undefined;
  const before = design && photos.find((a) => a.id === design.baseId);
  const locked = busy || starting || job?.status === "running";
  const me = session?.user;
  const signed = !!me;
  if (!active && refine) setRefine(false);
  async function run(task: () => Promise<void>) {
    setError("");
    setBusy(true);
    try {
      // Capture an immutable scope: changing rooms must not move an in-flight request.
      await queryClient
        .getMutationCache()
        .build(queryClient, {
          mutationKey: ["room", roomId],
          scope: { id: `room:${roomId}` },
          mutationFn: task,
        })
        .execute(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }
  async function create(type: string) {
    await run(async () => {
      const r = await api<Room>("/api/rooms", json({ type }));
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
        const r = await api<Room>("/api/rooms", { method: "PATCH", body: data });
        await update(r);
        if (kind !== "room")
          setSelected((p) => [...p, r.assets[r.assets.length - 1].id].slice(0, 10));
        else {
          setBaseId((p) => p || r.assets.find((a) => a.kind === "room")?.id || "");
          if (id === currentRoom.current) setView("photo");
        }
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
        "/api/import",
        json({
          roomId: room?.id,
          url: data.get("url"),
          name: data.get("name"),
          kind: data.get("kind"),
          dimensions: data.get("dimensions"),
        }),
      );
      await update(r);
      setSelected((p) => [...p, r.assets[r.assets.length - 1].id].slice(0, 10));
      setModal(null);
    });
  }
  async function saveSize(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!room || !sizeAsset) return;
    const data = new FormData(e.currentTarget);
    await run(async () => {
      const r = await api<Room>("/api/rooms", {
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
            await api<Room>("/api/rooms", { ...json({ roomId: room.id, name }), method: "PUT" }),
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
            await api<Room>("/api/rooms", {
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
          await api<{ deletedRoomId: string }>("/api/rooms", {
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
          r = await api<Room>("/api/rooms", {
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
    mutationFn: (body: unknown) => api<{ jobId: string }>("/api/generate", json(body)),
  });
  async function generate(options?: { fillGaps?: boolean }) {
    if (!room || !base) return;
    setStarting(true);
    setError("");
    try {
      await queryClient.cancelQueries({ queryKey: ["generation"] });
      const r = await generationMutation.mutateAsync({
        roomId: room.id,
        baseId: base.id,
        notes,
        style,
        assetIds: selected,
        previousDesignId: refine ? active?.id : undefined,
        fillGaps: options?.fillGaps,
        imageSettings,
      });
      watching.current = r.jobId;
      queryClient.setQueryData(["generation"], {
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
      await queryClient.invalidateQueries({ queryKey: ["generation"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed.");
    } finally {
      setStarting(false);
    }
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
    imageSettings,
    setImageSettings,
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
