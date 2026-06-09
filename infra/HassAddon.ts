/**
 * Custom Alchemy v2 resource: a Home Assistant *local add-on* managed over SSH.
 *
 * Lifecycle:
 *   reconcile -> build the bundle, rsync it into /addons/<slug> on the Pi, then
 *                have the Supervisor (re)build the image and (re)start it.
 *   delete    -> uninstall the add-on and remove its folder.
 *   read      -> query the Supervisor for the add-on's current state.
 *
 * Pattern mirrors the working v2 resources in Joehoel/throwback
 * (web/infra/cloudflare): `Resource<T>(...)` + `Provider.succeed(R, service)`.
 * This one shells out via Bun.$ instead of calling a cloud API, so it needs no
 * provider dependencies (hence Provider.succeed rather than Provider.effect).
 *
 * Requires on the Pi: the "Advanced SSH & Web Terminal" add-on with Protection
 * mode OFF (exposes the `ha` CLI and the /addons share), plus your SSH key.
 */
import { $ } from "bun";
import * as Provider from "alchemy/Provider";
import { Resource } from "alchemy/Resource";
import * as Effect from "effect/Effect";

export interface HassAddonProps {
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
}

export type HassAddon = Resource<
  "HomeAssistant.LocalAddon",
  HassAddonProps,
  { slug: string; state: string }
>;

export const HassAddon = Resource<HassAddon>("HomeAssistant.LocalAddon");

const sh = (user: string, host: string, command: string, allowFail = false) =>
  Effect.promise(() => {
    const proc = $`ssh ${`${user}@${host}`} ${{ raw: command }}`.quiet();
    return (allowFail ? proc.nothrow() : proc).text();
  });

const stateFrom = (raw: string): string =>
  (JSON.parse(raw) as { data?: { state?: string } }).data?.state ?? "unknown";

export const HassAddonProvider = () =>
  Provider.succeed(HassAddon, {
    stables: ["slug"],

    reconcile: ({ news }) =>
      Effect.gen(function* () {
        const { host, user, slug, localDir, build } = news;

        if (build !== undefined) {
          yield* Effect.promise(() => $`sh -c ${build}`.quiet().text());
        }

        yield* Effect.promise(() =>
          $`rsync -az --delete ${`${localDir}/`} ${`${user}@${host}:/addons/${slug}/`}`
            .quiet()
            .text(),
        );

        yield* sh(user, host, "ha addons reload");
        yield* sh(user, host, `ha addons rebuild local_${slug} || ha addons install local_${slug}`);
        yield* sh(user, host, `ha addons restart local_${slug}`);

        const info = yield* sh(user, host, `ha addons info local_${slug} --raw-json`);
        return { slug, state: stateFrom(info) };
      }),

    delete: ({ olds }) =>
      Effect.gen(function* () {
        const { host, user, slug } = olds;
        // Idempotent: ignore failures if the add-on is already gone.
        yield* sh(user, host, `ha addons uninstall local_${slug}`, true);
        yield* sh(user, host, `rm -rf /addons/${slug}`, true);
      }),

    read: ({ olds }) =>
      Effect.gen(function* () {
        const { host, user, slug } = olds;
        const info = yield* sh(user, host, `ha addons info local_${slug} --raw-json`, true);
        if (info.trim() === "") {
          return undefined;
        }
        try {
          return { slug, state: stateFrom(info) };
        } catch {
          return undefined;
        }
      }),
  });
