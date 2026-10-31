import { vi } from "vitest";

// Unit tests provide their own environment and must never resolve live secrets.
vi.mock("varlock/env", () => ({
  ENV: new Proxy(
    {},
    {
      get(_target, key) {
        if (typeof key !== "string") return undefined;
        const value = process.env[key];
        return key === "DEV_AUTH_BYPASS" || key === "ROOMFORM_LOCAL" ? value === "true" : value;
      },
    },
  ),
}));
