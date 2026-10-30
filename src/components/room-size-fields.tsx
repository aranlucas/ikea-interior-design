import { useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  convertRoomSize,
  readRoomSize,
  writeRoomSize,
  type RoomSizeFields as Fields,
  type RoomUnit,
} from "../lib/room-measurements";

export function RoomSizeFields({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  const [draft, setDraft] = useState(() => ({
    source: value,
    fields: readRoomSize(value, "m"),
    unit: "m" as RoomUnit,
  }));
  // Room data may arrive after mounting. Preserve local decimal input until an external update.
  if (draft.source !== value) {
    setDraft({ ...draft, source: value, fields: readRoomSize(value, draft.unit) });
  }
  function update(fields: Fields, unit = draft.unit) {
    const source = writeRoomSize(fields, unit);
    setDraft({ source, fields, unit });
    onChange(source);
  }
  const hasParsedSize = Object.values(draft.fields).some(Boolean);
  return (
    <fieldset className="room-size-fields" disabled={disabled}>
      <legend>
        Room size <em>optional</em>
      </legend>
      <div className="field-row">
        <label className="field">
          <span>Units</span>
          <div className="select">
            <select
              value={draft.unit}
              onChange={(e) => {
                const unit = e.target.value as RoomUnit;
                // Changing display units alone must not overwrite legacy measurement text.
                setDraft({
                  ...draft,
                  unit,
                  fields: convertRoomSize(draft.fields, draft.unit, unit),
                });
              }}
            >
              <option value="m">Meters</option>
              <option value="cm">Centimeters</option>
              <option value="ft">Feet</option>
              <option value="in">Inches</option>
            </select>
            <ChevronDown size={14} />
          </div>
        </label>
        {(
          [
            ["width", "Width"],
            ["depth", "Length / depth"],
            ["height", "Ceiling height"],
          ] as const
        ).map(([axis, label]) => (
          <label className="field" key={axis}>
            <span>
              {label} ({draft.unit})
            </span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              placeholder="Unknown"
              value={draft.fields[axis]}
              onChange={(e) => {
                const next = e.target.value;
                if (next !== "" && (!Number.isFinite(Number(next)) || Number(next) < 0)) return;
                update({ ...draft.fields, [axis]: next });
              }}
            />
          </label>
        ))}
      </div>
      <p className="hint">Anchors furniture scale. Leave unknown dimensions blank.</p>
      {value && !hasParsedSize && (
        <p className="hint">Saved room size: {value}. Enter dimensions to replace it.</p>
      )}
    </fieldset>
  );
}
