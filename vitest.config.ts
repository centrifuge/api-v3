import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "ponder:schema": path.resolve(__dirname, "test/helpers/ponder-schema.ts"),
      "ponder:registry": path.resolve(__dirname, "test/helpers/ponder-registry.stub.ts"),
    },
  },
});
