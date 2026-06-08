/**
 * Custom Alchemy v2 resource: a Home Assistant *local add-on* managed over SSH.
 *
 * Lifecycle mapping:
 *   reconcile -> rsync the built add-on into /addons/<slug>, then have the
 *                Supervisor (re)build the image and (re)start it.
 *   delete    -> uninstall the add-on and remove its folder.
 *   read      -> query the Supervisor for the add-on's current state.
 *
 * Requirements on the Pi (Home Assistant OS):
 *   - The "Advanced SSH & Web Terminal" add-on, with Protection mode OFF
 *     (this is what exposes the `ha` CLI and the /addons share over SSH).
 *   - Your SSH public key added to that add-on's config.
 *
 * ⚠️ STATUS: REFERENCE / EXPERIMENT — not runnable from npm yet.
 * As of this writing the published `alchemy` package is a broken pipeline
 * artifact (ships unbuilt TS, type errors, no proper exports) and its API does
 * not match this code. This file targets the alchemy-effect `main` source API
 * (Resource + Provider.succeed + reconcile/delete/read). Until v2 has a real
 * release, use the working `deploy.ts` script instead, or run Alchemy from a
 * git checkout. When v2 ships, install it and reconcile this against the
 * "Writing a Custom Resource Provider" guide.
 */
import { $ } from "bun";
import { Effect } from "effect";
import { Provider, Resource } from "alchemy";
import type { ResourceLike } from "alchemy";

export type HassAddon = ResourceLike<
  "HomeAssistant.LocalAddon",
  {
    /** SSH host of the Pi (the Advanced SSH & Web Terminal add-on). */
    host: string;
    /** SSH user (typically "root" for that add-on). */
    user: string;
    /** Add-on slug: the folder under /addons and the `local_<slug>` id. */
    slug: string;
    /** Local directory rsynced into /addons/<slug> (the built staging dir). */
    localDir: string;
    /** Optional shell command run before syncing, e.g. to build the bundle. */
    build?: string;
  },
  {
    slug: string;
    /** Supervisor-reported state, e.g. "started" | "stopped". */
    state: string;
  }
>;

export const HassAddon = Resource<HassAddon>("HomeAssistant.LocalAddon");

function ssh(user: string, host: string, command: string, allowFail = false) {
  return Effect.tryPromise(() => {
    const proc = $`ssh ${`${user}@${host}`} ${{ raw: command }}`.quiet();
    return (allowFail ? proc.nothrow() : proc).text();
  });
}

export const HassAddonProvider = Provider.succeed(HassAddon, {
  reconcile: ({ news }) =>
    Effect.gen(function* () {
      const { host, user, slug, localDir, build } = news;

      if (build !== undefined) {
        yield* Effect.tryPromise(() => $`sh -c ${build}`.quiet().text());
      }

      // 1. Ship the built add-on into the local add-ons directory.
      yield* Effect.tryPromise(() =>
        $`rsync -az --delete ${`${localDir}/`} ${`${user}@${host}:/addons/${slug}/`}`
          .quiet()
          .text(),
      );

      // 2. Let the Supervisor discover, (re)build, and (re)start it.
      yield* ssh(user, host, "ha addons reload");
      yield* ssh(user, host, `ha addons rebuild local_${slug} || ha addons install local_${slug}`);
      yield* ssh(user, host, `ha addons restart local_${slug}`);

      // 3. Report the live state back into Alchemy's state.
      const info = yield* ssh(user, host, `ha addons info local_${slug} --raw-json`);
      const state = (JSON.parse(info) as { data?: { state?: string } }).data?.state ?? "unknown";
      return { slug, state };
    }),

  delete: ({ olds }) =>
    Effect.gen(function* () {
      const { host, user, slug } = olds;
      // Idempotent: ignore failures if the add-on is already gone.
      yield* ssh(user, host, `ha addons uninstall local_${slug}`, true);
      yield* ssh(user, host, `rm -rf /addons/${slug}`, true);
    }),

  read: ({ olds }) =>
    Effect.gen(function* () {
      const { host, user, slug } = olds;
      const info = yield* ssh(user, host, `ha addons info local_${slug} --raw-json`, true);
      if (info.trim() === "") {
        return undefined;
      }

      try {
        const state = (JSON.parse(info) as { data?: { state?: string } }).data?.state;
        return state === undefined ? undefined : { slug, state };
      } catch {
        return undefined;
      }
    }),
});
