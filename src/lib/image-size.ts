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
export function outputSize(bytes: Uint8Array): `${number}x${number}` {
  const dimensions = jpegDimensions(bytes);
  if (!dimensions) return "3840x2160";
  const ratio = Math.max(1 / 3, Math.min(3, dimensions.width / dimensions.height));
  const height = Math.min(3840, 3840 / ratio, Math.sqrt(8_294_400 / ratio));
  // Round down to meet the API's edge, pixel-count, and multiple-of-16 limits.
  const width = Math.floor((height * ratio) / 16) * 16;
  const roundedHeight = Math.floor(height / 16) * 16;
  return `${width}x${roundedHeight}`;
}
