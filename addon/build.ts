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

// The Supervisor build context is the add-on folder, so the manifest, build
// config, and Dockerfile must sit next to the bundle.
//
// Strip the `image:` field for local/SSH deploys so the Supervisor builds the
// container from the Dockerfile on the Pi. The committed config.yaml keeps
// `image:` so store installs pull the prebuilt image published by CI.
const config = await Bun.file(join(here, "config.yaml")).text();
await Bun.write(join(staging, "config.yaml"), config.replace(/^image:.*\n?/m, ""));
await cp(join(here, "Dockerfile"), join(staging, "Dockerfile"));
await cp(join(here, "build.yaml"), join(staging, "build.yaml"));

console.log(`[build] staging ready: ${staging}`);
