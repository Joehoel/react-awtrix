import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "jsx-runtime": "src/jsx-runtime.ts",
    "jsx-dev-runtime": "src/jsx-dev-runtime.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  platform: "node",
  target: "node18",
  exports: false,
  publint: true,
  attw: true,
});
