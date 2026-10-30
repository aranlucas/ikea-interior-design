import { parseRoomMeasurements } from "./scale";

export const roomUnits = { m: 100, cm: 1, ft: 30.48, in: 2.54 } as const;
export type RoomUnit = keyof typeof roomUnits;
export type RoomSizeFields = { width: string; depth: string; height: string };

export function readRoomSize(value: string, unit: RoomUnit): RoomSizeFields {
  const size = parseRoomMeasurements(value);
  const display = (cm?: number) =>
    cm === undefined ? "" : String(Number((cm / roomUnits[unit]).toFixed(4)));
  return {
    width: display(size?.widthCm),
    depth: display(size?.depthCm),
    height: display(size?.heightCm),
  };
}

export function writeRoomSize(fields: RoomSizeFields, unit: RoomUnit): string {
  return (["width", "depth", "height"] as const)
    .filter((axis) => fields[axis] !== "" && Number(fields[axis]) > 0)
    .map((axis) => `${axis}: ${fields[axis]} ${unit}`)
    .join(", ");
}

export function convertRoomSize(
  fields: RoomSizeFields,
  from: RoomUnit,
  to: RoomUnit,
): RoomSizeFields {
  const convert = (value: string) =>
    value === ""
      ? ""
      : String(Number(((Number(value) * roomUnits[from]) / roomUnits[to]).toFixed(4)));
  return {
    width: convert(fields.width),
    depth: convert(fields.depth),
    height: convert(fields.height),
  };
}
