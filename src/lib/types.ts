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
export type Design = { id: string; key: string; prompt: string; createdAt: string; baseId: string };
export type Room = {
  id: string;
  name: string;
  type: string;
  notes: string;
  style: string;
  assets: Asset[];
  designs: Design[];
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
