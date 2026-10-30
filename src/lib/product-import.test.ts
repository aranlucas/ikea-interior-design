import { describe, it, expect, vi } from "vitest";
import { extractPageReference } from "./product-import.server";
import { publicUrl, isPublicAddress, fetchPublic } from "./public-fetch.server";
const dnsLookup = vi.hoisted(() =>
  vi.fn<
    (hostname: string, options: { all: true }) => Promise<{ address: string; family: number }[]>
  >(),
);
vi.mock("node:dns/promises", () => ({ lookup: dnsLookup }));
describe("public product references", () => {
  it("prefers a secure image and decodes metadata regardless of attribute order", () => {
    const r = extractPageReference(
      '<meta content="Sofa &amp; ottoman" property="og:title"><meta content="http://shop.example/left.jpg" property="og:image"><meta content="https://cdn.example/photo.jpg?a=1&amp;b=2" property="og:image:secure_url">',
      new URL("https://shop.example/product"),
    );
    expect(r.title).toBe("Sofa & ottoman");
    expect(r.imageUrl.href).toBe("https://cdn.example/photo.jpg?a=1&b=2");
  });
  it("supports relative Twitter images and structured product image objects", () => {
    expect(
      extractPageReference(
        '<meta name="twitter:image" content="/sofa.png">',
        new URL("https://shop.example/product"),
      ).imageUrl.href,
    ).toBe("https://shop.example/sofa.png");
    expect(
      extractPageReference(
        '<script type="application/ld+json">{"@graph":[{"@type":"Product","image":[{"contentUrl":"https://cdn.example/sofa.jpg"}]}]}</script>',
        new URL("https://shop.example/product"),
      ).imageUrl.href,
    ).toBe("https://cdn.example/sofa.jpg");
  });
  it("rejects non-HTTPS, credentials, custom ports and literal IP targets", () => {
    for (const url of [
      "http://shop.example/a",
      "https://user:secret@shop.example/a",
      "https://shop.example:8000/a",
      "https://127.0.0.1/a",
      "https://[::1]/a",
      "https://2130706433/a",
      "https://localhost/a",
    ])
      expect(() => publicUrl(url)).toThrow();
  });
  it("rejects private, reserved and mapped local DNS answers", async () => {
    for (const address of [
      "127.0.0.1",
      "10.0.0.1",
      "172.16.0.1",
      "192.168.1.1",
      "169.254.169.254",
      "::1",
      "::ffff:127.0.0.1",
      "fc00::1",
      "fe80::1",
      "224.0.0.1",
    ])
      expect(isPublicAddress(address)).toBe(false);
    expect(isPublicAddress("8.8.8.8")).toBe(true);
    dnsLookup.mockResolvedValueOnce([{ address: "127.0.0.1", family: 4 }]);
    await expect(fetchPublic("https://shop.example/product", 1000)).rejects.toThrow(
      "Private network",
    );
  });
});
