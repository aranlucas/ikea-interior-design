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
export function outputSize(bytes: Uint8Array): "1024x1536" | "1024x1024" | "1536x1024" {
  const dimensions = jpegDimensions(bytes);
  if (!dimensions) return "1536x1024";
  const ratio = dimensions.width / dimensions.height;
  return ratio < 0.9 ? "1024x1536" : ratio <= 1.1 ? "1024x1024" : "1536x1024";
}
