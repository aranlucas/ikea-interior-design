import { expect, it } from "vitest";
import { generationOptions, roomsOptions, sessionOptions } from "./studio-queries";

it("allows session/room loader prefetch but keeps generation client-only", () => {
  expect(sessionOptions()).not.toHaveProperty("enabled");
  expect(roomsOptions()).not.toHaveProperty("enabled");
  expect(generationOptions().enabled).toBe(false);
});
