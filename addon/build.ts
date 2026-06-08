// Bundles the add-on into a single self-contained `main.js` and assembles a
// `staging/` directory that is ready to rsync into /addons/<slug> on the Pi.
//
// react-awtrix is resolved from source via the tsconfig `paths` alias, so this
// works without publishing the library. The bundle includes the library's MQTT
// re-export (aedes/mqtt) as dead weight — it is never instantiated since the
// clock uses the HTTP protocol — so the image stays small enough regardless.
import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const staging = join(here, "staging");

await rm(staging, { recursive: true, force: true });
await mkdir(staging, { recursive: true });

const result = await Bun.build({
  entrypoints: [join(here, "src/main.tsx")],
  outdir: staging,
  target: "bun",
  minify: true,
  naming: "[name].js",
});

if (!result.success) {
  for (const message of result.logs) {
    console.error(message);
  }
  throw new Error("[build] bundle failed");
}

// The Supervisor build context is the add-on folder, so the manifest and
// Dockerfile must sit next to the bundle.
await cp(join(here, "config.yaml"), join(staging, "config.yaml"));
await cp(join(here, "Dockerfile"), join(staging, "Dockerfile"));

console.log(`[build] staging ready: ${staging}`);
