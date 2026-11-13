import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    globals: true,
    // never write the real usage store; tests that record set CMD_PALLET_USAGE=1 + a temp dir
    env: { CMD_PALLET_USAGE: "0" },
  },
});
