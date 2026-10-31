import type { ImageSettings } from "./image-settings";
export type Asset = {
  id: string;
  name: string;
  key: string;
  kind: "room" | "product" | "inspiration";
  url?: string;
  notes?: string;
  dimensions?: string;
  availableSizes?: string[];
};
export type Design = {
  id: string;
  key: string;
  prompt: string;
  createdAt: string;
  baseId: string;
  inferred?: boolean;
  generation?: {
    model: string;
    quality: ImageSettings["quality"];
    size: string;
    outputTokens?: number;
    outputCostUsd?: number;
  };
};
export type RoomSurface = "back" | "right" | "front" | "left";
export type RoomModel = {
  width: number;
  depth: number;
  height: number;
  walls: Partial<Record<RoomSurface, string>>;
};
export type ReconstructionResult = {
  id: string;
  key: string;
  photoIds: string[];
  registeredIds: string[];
  pointCount: number;
  components: number;
  kind?: "sparse" | "ai-layout";
  sourcePhotoIds?: string[];
  model?: string;
  fixtureCount?: number;
};
export type ReconstructionJob = {
  id: string;
  status: "running" | "succeeded" | "failed" | "cancelled";
  stage: string;
  error?: string;
  photoIds: string[];
  createdAt: string;
  updatedAt: string;
  mode?: "classical" | "ai-layout";
  result?: ReconstructionResult;
};
export type Room = {
  id: string;
  name: string;
  type: string;
  notes: string;
  style: string;
  imageSettings?: ImageSettings;
  assets: Asset[];
  designs: Design[];
  model?: RoomModel;
  reconstruction?: ReconstructionJob;
  createdAt: string;
};
export type User = { sub: string; name: string; email?: string };
export const assetUrl = (key: string) => `/api/media?key=${encodeURIComponent(key)}`;

export type GenerationJob = {
  id: string;
  owner: string;
  roomId: string;
  status: "running" | "succeeded" | "failed";
  error: string | null;
  designId: string | null;
  createdAt: string;
  updatedAt: string;
};
