import type { Asset } from "./types";

// The photo to show when stepping through the room's photos from the current
// one, or undefined when there is nowhere to step: one photo or an edge.
export function stepPhoto(photos: Asset[], currentId: string, step: 1 | -1): Asset | undefined {
  if (photos.length < 2) return undefined;
  const index = photos.findIndex((a) => a.id === currentId);
  if (index < 0) return step === 1 ? photos[0] : photos[photos.length - 1];
  const next = index + step;
  if (next < 0 || next >= photos.length) return undefined;
  return photos[next];
}
