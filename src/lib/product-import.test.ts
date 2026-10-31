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
  const amazonUrl = new URL("https://www.amazon.com/dp/B01M7M9NXX?th=1");
  it.each([
    "com.br",
    "com.mx",
    "nl",
    "se",
    "pl",
    "ie",
    "com.be",
    "eg",
    "sg",
    "sa",
    "com.tr",
    "ae",
    "cn",
  ])("uses the primary product image and rejects challenges on amazon.%s", (suffix) => {
    const url = new URL(`https://www.amazon.${suffix}/dp/B01M7M9NXX`);
    expect(
      extractPageReference(
        '<meta property="og:image" content="https://cdn.example/ad.jpg"><img id="landingImage" src="https://cdn.example/bed.jpg">',
        url,
      ).imageUrl.href,
    ).toBe("https://cdn.example/bed.jpg");
    expect(() => extractPageReference("<title>Robot Check</title>", url)).toThrow("Amazon blocked");
  });
  it.each(["amazon.com.example.org", "fakeamazon.com"])(
    "keeps generic extraction for the non-Amazon host %s",
    (hostname) => {
      expect(
        extractPageReference(
          '<meta property="og:image" content="https://cdn.example/product.jpg"><img id="landingImage" src="https://cdn.example/other.jpg">',
          new URL(`https://${hostname}/product`),
        ).imageUrl.href,
      ).toBe("https://cdn.example/product.jpg");
    },
  );
  it("imports Amazon's displayed product photo at full resolution ahead of generic metadata", () => {
    const reference = extractPageReference(
      '<meta property="og:image" content="https://cdn.example/generic.jpg"><h1>Other heading</h1><span id="productTitle">Zinus Shalini Queen Bed</span><img src="https://cdn.example/recommendation.jpg"><img id="landingImage" src="https://m.media-amazon.com/images/I/preview.jpg" data-old-hires="https://m.media-amazon.com/images/I/bed.jpg">',
      amazonUrl,
    );
    expect(reference.title).toBe("Zinus Shalini Queen Bed");
    expect(reference.imageUrl.href).toBe("https://m.media-amazon.com/images/I/bed.jpg");
  });
  it("chooses the largest Amazon dynamic image and falls back to src for malformed maps", () => {
    const image = '<img id="landingImage" src="https://cdn.example/preview.jpg"';
    expect(
      extractPageReference(
        `${image} data-a-dynamic-image='{ "https://cdn.example/small.jpg": [300,300], "https://cdn.example/large.jpg": [1500,1000], "https://cdn.example/invalid.jpg": [99999,-1] }'>`,
        amazonUrl,
      ).imageUrl.href,
    ).toBe("https://cdn.example/large.jpg");
    expect(
      extractPageReference(`${image} data-a-dynamic-image="broken">`, amazonUrl).imageUrl.href,
    ).toBe("https://cdn.example/preview.jpg");
  });
  it("does not import Amazon challenge images as product photos", () => {
    expect(() =>
      extractPageReference(
        '<title>Amazon</title><form action="/errors/validateCaptcha"><input id="captchacharacters"></form><main><img src="https://cdn.example/captcha.jpg"></main>',
        amazonUrl,
      ),
    ).toThrow("Amazon blocked");
    expect(() => extractPageReference("<title>Robot Check</title>", amazonUrl)).toThrow(
      "Amazon blocked",
    );
  });
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
