import { load } from "cheerio";
function quantity(value: unknown): string | undefined {
  if (typeof value === "string") {
    const text = value.trim();
    return !text || /^\d+(?:\.\d+)?$/.test(text) || /\b(?:px|pixels?)\b/i.test(text)
      ? undefined
      : text.slice(0, 80);
  }
  if (!value || typeof value !== "object") return;
  const q = value as Record<string, unknown>;
  const unit =
    typeof q.unitText === "string"
      ? q.unitText
      : typeof q.unitCode === "string"
        ? { INH: "in", CMT: "cm", MMT: "mm", MTR: "m", FOT: "ft" }[q.unitCode] || q.unitCode
        : "";
  if (
    (typeof q.value === "number" || typeof q.value === "string") &&
    unit &&
    !/^(px|pixels?)$/i.test(unit)
  )
    return `${q.value} ${unit}`;
}
export function extractProductDimensions(html: string) {
  const $ = load(html);
  let result: string | undefined;
  function walk(value: unknown, depth = 0) {
    if (result || !value || typeof value !== "object" || depth > 6) return;
    if (Array.isArray(value)) {
      value.forEach((v) => walk(v, depth + 1));
      return;
    }
    const item = value as Record<string, unknown>;
    if (
      item["@type"] === "Product" ||
      (Array.isArray(item["@type"]) && item["@type"].includes("Product"))
    ) {
      const dimensions = ["width", "height", "depth"].flatMap((axis) => {
        const value = quantity(item[axis]);
        return value ? [`${axis}: ${value}`] : [];
      });
      result = (dimensions.join(" × ") || quantity(item.size))?.slice(0, 200);
    }
    if (!result) Object.values(item).forEach((v) => walk(v, depth + 1));
  }
  $('script[type="application/ld+json"]').each((_i, el) => {
    try {
      walk(JSON.parse($(el).text()));
    } catch {
      /* Ignore malformed blocks. */
    }
  });
  return result;
}
export function shopifySize(
  product: {
    options?: { name: string; position?: number; values: string[] }[];
    variants: { id: string | number; options?: string[] }[];
  },
  variantId?: string,
) {
  const index =
    product.options?.findIndex((o) => /^(size|dimensions?|measurements?)$/i.test(o.name.trim())) ??
    -1;
  if (index < 0) return { dimensions: undefined, availableSizes: [] as string[] };
  const option = product.options![index];
  const availableSizes = [...new Set(option.values.map((v) => v.trim()).filter(Boolean))]
    .slice(0, 30)
    .map((v) => v.slice(0, 200));
  const variant = variantId ? product.variants.find((v) => String(v.id) === variantId) : undefined;
  const selected = variant?.options?.[(option.position || index + 1) - 1];
  return {
    dimensions:
      selected?.slice(0, 200) || (availableSizes.length === 1 ? availableSizes[0] : undefined),
    availableSizes,
  };
}
