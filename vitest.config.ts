import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    testTimeout: 30_000,
    env: { PROJECT_AID_STORE: "memory", PROJECT_AID_DATA_DIR: "", PROJECT_AID_LLM: "off" },
  },
});
