import type { User } from "./types";
export type Session = {
  user: User | null;
  local: boolean;
  authConfigured: boolean;
  generationConfigured: boolean;
};
export type View = "photo" | "design" | "compare";
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, init);
  if (!r.ok) {
    const text = await r.text();
    try {
      throw new Error(JSON.parse(text).error || text);
    } catch (e) {
      if (e instanceof SyntaxError) throw new Error(text);
      throw e;
    }
  }
  return r.json();
}
export const json = (body: unknown) => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
export const styles = [
  "Warm minimalism",
  "Scandinavian",
  "Japandi",
  "Mid-century modern",
  "Organic modern",
  "Eclectic",
];
export const roomTypes = [
  "Living room",
  "Bedroom",
  "Dining room",
  "Home office",
  "Kitchen",
  "Other",
];
export const accept = "image/jpeg,image/png,image/webp";

export async function compress(file: File) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error("Choose a JPG, PNG or WebP image.");
  if (file.size > 25_000_000) throw new Error("Choose a photo smaller than 25 MB.");
  const image = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  canvas.getContext("2d")!.drawImage(image, 0, 0, canvas.width, canvas.height);
  image.close();
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Could not prepare photo."))),
      "image/jpeg",
      0.88,
    ),
  );
  return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpeg", { type: "image/jpeg" });
}
