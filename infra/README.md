# react-awtrix infra — declarative deploy to the Pi (Alchemy v2)

Deploys the [`../addon`](../addon) Home Assistant add-on to your Pi with a
**custom Alchemy v2 resource** (`HassAddon`) that drives the Supervisor over SSH
(build → rsync into `/addons` → `ha addons …`). State is **local** — this deploy
never touches Cloudflare.

```
infra/
├─ alchemy.run.ts   # the stack (Alchemy.Stack + localState)
└─ HassAddon.ts     # custom resource + provider (reconcile/delete/read)
```

## Versions matter (this is what tripped me up earlier)

Alchemy v2 is in beta, and its prerelease range on npm is messy — `^2.0.0-beta.52`
resolves to a broken interim build. Pin **exactly**, and use **Effect 4**:

```jsonc
"devDependencies": { "alchemy": "2.0.0-beta.52" },   // exact, no caret
"dependencies":    { "effect": "^4.0.0-beta.78" }     // Effect 4, not 3
```

These are the versions from the working reference (`Joehoel/throwback`). With them,
this stack typechecks and loads cleanly. The custom-resource shape mirrors that
repo's `web/infra/cloudflare` resources: `Resource<T>(...)` + `Provider.succeed`,
with `stables` / `reconcile` / `delete` / `read`.

## Prerequisites on the Pi (Home Assistant OS)

1. Install the **Advanced SSH & Web Terminal** add-on.
2. Turn **Protection mode OFF** (needed for the `ha` CLI and `/addons` access).
3. Add your SSH public key in that add-on's configuration.

## Usage

```bash
cd infra
bun install

HA_SSH_HOST=homeassistant.local HA_SSH_USER=root bun run plan    # preview
bun run deploy                                                    # apply
bun run destroy                                                   # tear down
```

Then set the add-on's `awtrix_host` option in the HA UI and restart it.

## Trade-offs

- This leans on the SSH add-on with Protection mode off — a real loosening of
  that appliance's security posture. Fine for a home lab; know the trade-off.
- More "native" alternative: publish `addon/` as a GitHub add-on **repository**
  and install/update from the HA store (GitOps, no SSH).
