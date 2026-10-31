/** Read JPEG SOF dimensions without decoding pixels. Malformed headers are ignored. */
export function jpegDimensions(bytes: Uint8Array) {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return;
  let offset = 2;
  while (offset + 3 < bytes.length) {
    if (bytes[offset++] !== 0xff) return;
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xda || marker === 0xd9) return;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    const length = (bytes[offset] << 8) | bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length) return;
    if (
      [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(
        marker,
      )
    ) {
      if (length < 8) return;
      const height = (bytes[offset + 3] << 8) | bytes[offset + 4];
      const width = (bytes[offset + 5] << 8) | bytes[offset + 6];
      if (width && height) return { width, height };
      return;
    }
    offset += length;
  }
}
/** Read PNG IHDR dimensions without decoding pixels. Malformed headers are ignored. */
export function pngDimensions(bytes: Uint8Array) {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 24 || !signature.every((b, i) => bytes[i] === b)) return;
  if (bytes[12] !== 0x49 || bytes[13] !== 0x48 || bytes[14] !== 0x44 || bytes[15] !== 0x52) return;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  return width && height ? { width, height } : undefined;
}
export function outputSize(bytes: Uint8Array): "1024x1536" | "1024x1024" | "1536x1024" {
  const dimensions = jpegDimensions(bytes) ?? pngDimensions(bytes);
  if (!dimensions) return "1536x1024";
  const ratio = dimensions.width / dimensions.height;
  return ratio < 0.9 ? "1024x1536" : ratio <= 1.1 ? "1024x1024" : "1536x1024";
}
export function orientationSize(
  orientation: "landscape" | "portrait" | "square",
): "1024x1536" | "1024x1024" | "1536x1024" {
  return orientation === "portrait"
    ? "1024x1536"
    : orientation === "square"
      ? "1024x1024"
      : "1536x1024";
}
