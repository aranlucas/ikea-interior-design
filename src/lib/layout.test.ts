import { describe, it, expect } from "vitest";
import { parsePlan, formatPlan } from "./layout.server";

const reply = `Here is the plan you asked for.
\`\`\`json
{
  "roomEstimate": "back wall ~420 cm (door leaf 200 cm used as reference), ceiling ~260 cm",
  "placements": [
    { "name": "Sofa", "position": "against the back wall, left of the window", "widthRatio": 0.5, "notes": "facing the window wall" },
    { "name": "Coffee table", "position": "in front of the sofa", "widthRatio": "half of the sofa" }
  ],
  "cautions": "Keep the radiator on the right wall unobstructed."
}
\`\`\`
Let me know if you want alternatives.`;

describe("parsePlan", () => {
  it("extracts and validates the plan JSON from a chatty reply", () => {
    const plan = parsePlan(reply);
    expect(plan).not.toBeNull();
    expect(plan!.roomEstimate).toContain("back wall ~420 cm");
    expect(plan!.placements).toHaveLength(2);
    expect(plan!.placements[0]).toMatchObject({ name: "Sofa", widthRatio: 0.5 });
    expect(plan!.placements[1].widthRatio).toBeUndefined();
    expect(plan!.cautions).toContain("radiator");
  });

  it("returns null for non-JSON replies", () => {
    expect(parsePlan("I cannot help with that.")).toBeNull();
    expect(parsePlan("{not json}")).toBeNull();
    expect(parsePlan("")).toBeNull();
  });
});

describe("formatPlan", () => {
  it("renders the plan as compact placement sentences", () => {
    const text = formatPlan(parsePlan(reply)!);
    expect(text).toContain("Estimated room geometry: back wall ~420 cm");
    expect(text).toContain(
      "- Sofa: against the back wall, left of the window (spans about 50% of that wall's width) — facing the window wall",
    );
    expect(text).toContain("- Coffee table: in front of the sofa");
    expect(text).toContain("Watch out: Keep the radiator");
  });

  it("fills in missing positions", () => {
    const text = formatPlan({ placements: [{ name: "Lamp" }] });
    expect(text).toBe("- Lamp: placement flexible");
  });
});
