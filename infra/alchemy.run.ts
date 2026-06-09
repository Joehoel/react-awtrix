/**
 * Alchemy v2 stack: declaratively deploy the react-awtrix add-on to the Pi.
 *
 *   bun run plan       # preview
 *   bun run deploy     # build + sync + (re)start the add-on
 *   bun run destroy    # uninstall it and clean /addons
 *
 * State is local (no cloud account needed) — this deploy never touches
 * Cloudflare. Configure via env (or edit inline):
 *   HA_SSH_HOST   default "homeassistant.local"
 *   HA_SSH_USER   default "root"
 */
import * as Alchemy from "alchemy";
import { localState } from "alchemy/State/LocalState";
import * as Effect from "effect/Effect";
import { HassAddon, HassAddonProvider } from "./HassAddon.ts";

export default Alchemy.Stack(
  "AwtrixPi",
  {
    providers: HassAddonProvider(),
    state: localState(),
  },
  Effect.gen(function* () {
    const addon = yield* HassAddon("clock", {
      host: process.env.HA_SSH_HOST ?? "homeassistant.local",
      user: process.env.HA_SSH_USER ?? "root",
      slug: "react_awtrix",
      localDir: "../addon/staging",
      build: "cd ../addon && bun run build",
    });

    return {
      state: addon.state,
    };
  }),
);
