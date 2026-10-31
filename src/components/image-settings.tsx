import { ChevronDown } from "lucide-react";
import { qualityOptions, sizeOptions, type ImageSettings as Settings } from "../lib/image-settings";

export function ImageSettings({
  value,
  onChange,
  model,
  disabled,
}: {
  value: Settings;
  onChange: (value: Settings) => void;
  model: string;
  disabled: boolean;
}) {
  const experimental =
    value.size === "photo" ||
    value.size === "3840x2160" ||
    value.size === "2160x3840" ||
    value.size === "2048x2048";
  return (
    <fieldset className="image-settings" disabled={disabled} aria-describedby="image-settings-help">
      <legend>Image settings</legend>
      <label className="field">
        <span>Quality</span>
        <div className="select">
          <select
            value={value.quality}
            onChange={(e) => onChange({ ...value, quality: e.target.value as Settings["quality"] })}
          >
            {qualityOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <ChevronDown size={14} />
        </div>
      </label>
      <label className="field">
        <span>Output size</span>
        <div className="select">
          <select
            value={value.size}
            onChange={(e) => onChange({ ...value, size: e.target.value as Settings["size"] })}
          >
            {sizeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <ChevronDown size={14} />
        </div>
      </label>
      <p className="hint" id="image-settings-help">
        {value.quality === "auto"
          ? "Auto lets the model choose quality."
          : value.quality === "max"
            ? "Max is the highest quality. Allow a few minutes."
            : "Higher quality adds detail, time, and cost."}
        {experimental && " Output above 2560 × 1440 is experimental."}
        {value.size !== "photo" && " Choose Match photo to keep its framing."}
      </p>
      <details className="generation-help">
        <summary>Model & API credits</summary>
        <div>
          <span className="model-name">{model}</span>
          <p>PNG download. Each generation uses the server’s OpenAI API key.</p>
          <p>
            Eligible ChatGPT Pro and Business subscribers can claim API credits for a linked
            organization. Use a key from that organization; unused credits expire.
          </p>
          <a
            href="https://developers.openai.com/api/docs/guides/chatgpt-api-credits"
            target="_blank"
            rel="noreferrer"
          >
            Check credit eligibility ↗
          </a>
        </div>
      </details>
    </fieldset>
  );
}
