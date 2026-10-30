import { afterEach, expect, it, vi } from "vitest";
vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("ai")>()),
  generateText: vi.fn(),
}));
import { generateText } from "ai";
import { runAiRoomLayout } from "./ai-room-layout.server";
import { exampleAiRoomLayout } from "./ai-room-layout.fixture";
afterEach(() => vi.unstubAllEnvs());
it("sends all supplied room views in one structured vision request and records AI provenance", async () => {
  vi.stubEnv("OPENAI_API_KEY", "test-key");
  vi.stubEnv("OPENAI_VISION_MODEL", "gpt-6.1-sol");
  vi.mocked(generateText).mockResolvedValueOnce({ output: exampleAiRoomLayout() } as Awaited<
    ReturnType<typeof generateText>
  >);
  const photos = Array.from({ length: 4 }, (_, i) => ({
    id: crypto.randomUUID(),
    name: `Room ${i + 1}`,
    key: `photo-${i}.jpeg`,
    kind: "room" as const,
  }));
  const loadPhoto = vi.fn(async () => new Uint8Array([1, 2]));
  const result = await runAiRoomLayout({
    photos,
    loadPhoto,
    progress: vi.fn(),
    signal: AbortSignal.timeout(10_000),
  });
  expect(loadPhoto).toHaveBeenCalledTimes(4);
  const options = vi.mocked(generateText).mock.calls[0][0];
  const messages = options.messages;
  expect(messages?.[0].role).toBe("user");
  expect(messages).toHaveLength(1);
  expect(options.instructions).toBeTypeOf("string");
  const content = messages?.[0].content;
  expect(Array.isArray(content) && content.filter((part) => part.type === "file")).toHaveLength(4);
  expect(options.providerOptions).toEqual({ openai: { store: false, reasoningEffort: "medium" } });
  expect(options.maxRetries).toBe(0);
  expect(result.scene).toMatchObject({
    kind: "ai-layout",
    sourcePhotoIds: photos.map((p) => p.id),
    model: "gpt-6.1-sol",
    cameras: [],
    positions: [],
  });
  expect(result.scene.layout).toEqual(exampleAiRoomLayout());
});
