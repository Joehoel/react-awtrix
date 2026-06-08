/**
 * Alchemy v2 stack: declaratively deploy the react-awtrix add-on to the Pi.
 *
 * ⚠️ REFERENCE / EXPERIMENT — see the status note in HassAddon.ts. Alchemy v2 is
 * not yet installable from npm, so this stack does not run today. Use the
 * working `deploy.ts` (`bun run deploy`) until v2 has a real release.
 *
 * Configure via env (or edit inline):
 *   HA_SSH_HOST   default "homeassistant.local"
 *   HA_SSH_USER   default "root"
 */
import { Effect } from "effect";
import { Alchemy, State } from "alchemy";
import { HassAddon, HassAddonProvider } from "./HassAddon.ts";

export default Alchemy.Stack(
  "awtrix-pi",
  {
    providers: [HassAddonProvider],
    // Local file-based state — no cloud account required. The Cloudflare
    // equivalent is `Cloudflare.state()`; verify this helper name against the
    // v2 docs if it has moved.
    state: State.local(),
  },
  Effect.gen(function* () {
    const addon = yield* HassAddon("clock", {
      host: process.env.HA_SSH_HOST ?? "homeassistant.local",
      user: process.env.HA_SSH_USER ?? "root",
      slug: "react_awtrix",
      localDir: "../addon/staging",
      build: "cd ../addon && bun run build",
    });

    return { addonState: addon.state };
  }),
);
