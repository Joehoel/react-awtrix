// Plain-Bun declarative deploy — works TODAY, no Alchemy required.
//
// Mirrors the reconcile/delete logic of HassAddon.ts (the Alchemy v2 custom
// resource), so you can ship the add-on now while v2 stabilizes on npm.
//
//   bun run deploy.ts            # build + sync + (re)start the add-on
//   bun run deploy.ts --destroy  # uninstall it and clean /addons
//
// Config via env:
//   HA_SSH_HOST  default "homeassistant.local"
//   HA_SSH_USER  default "root"
//   ADDON_SLUG   default "react_awtrix"
import { $ } from "bun";

const host = process.env.HA_SSH_HOST ?? "homeassistant.local";
const user = process.env.HA_SSH_USER ?? "root";
const slug = process.env.ADDON_SLUG ?? "react_awtrix";
const target = `${user}@${host}`;
const destroy = process.argv.includes("--destroy");

const ssh = (cmd: string) => $`ssh ${target} ${{ raw: cmd }}`;

if (destroy) {
  console.log(`[deploy] uninstalling local_${slug}`);
  await ssh(`ha addons uninstall local_${slug}`).nothrow();
  await ssh(`rm -rf /addons/${slug}`).nothrow();
  console.log("[deploy] done");
} else {
  console.log("[deploy] building add-on bundle");
  await $`cd ../addon && bun run build`;

  console.log(`[deploy] syncing -> ${target}:/addons/${slug}`);
  await $`rsync -az --delete ../addon/staging/ ${`${target}:/addons/${slug}/`}`;

  console.log("[deploy] reloading + (re)building + restarting via Supervisor");
  await ssh("ha addons reload");
  await ssh(`ha addons rebuild local_${slug} || ha addons install local_${slug}`);
  await ssh(`ha addons restart local_${slug}`);

  const info = await ssh(`ha addons info local_${slug} --raw-json`).text();
  const state = (JSON.parse(info) as { data?: { state?: string } }).data?.state ?? "unknown";
  console.log(`[deploy] done — add-on state: ${state}`);
}
