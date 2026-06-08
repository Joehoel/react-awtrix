# react-awtrix infra — declarative deploy to the Pi

Deploys the [`../addon`](../addon) Home Assistant add-on to your Pi by driving
the Supervisor over SSH (build → rsync into `/addons` → `ha addons …`).

```
infra/
├─ deploy.ts        # ✅ WORKS TODAY — plain Bun deploy/destroy script
├─ HassAddon.ts     # ⚠️ Alchemy v2 custom resource (reference/experiment)
└─ alchemy.run.ts   # ⚠️ Alchemy v2 stack (reference/experiment)
```

## ⚠️ Status: Alchemy v2 is not usable from npm yet

I verified this directly: the published `alchemy` package currently resolves to a
broken pipeline build (`2.0.0-pipeline-v2-test`) that ships unbuilt TypeScript
with type errors and no proper `exports` — it doesn't install/run, and its API
doesn't match the documented v2 model. So `HassAddon.ts` / `alchemy.run.ts` are
kept as a **reference** of the intended custom-resource design (matching the
`alchemy-effect` `main` source: `Resource` + `Provider.succeed` +
`reconcile`/`delete`/`read`). Revisit once v2 has a real release, or run Alchemy
from a git checkout.

Until then, `deploy.ts` does the exact same reconcile/destroy logic with zero
dependencies.

## Prerequisites on the Pi (Home Assistant OS)

1. Install the **Advanced SSH & Web Terminal** add-on.
2. Turn **Protection mode OFF** (needed for the `ha` CLI and `/addons` access).
3. Add your SSH public key in that add-on's configuration.

## Usage (works today)

```bash
cd infra

# build the add-on, sync it, and (re)start it via the Supervisor
HA_SSH_HOST=homeassistant.local HA_SSH_USER=root bun run deploy

# tear it down
bun run destroy
```

Then set the add-on's `awtrix_host` option in the HA UI and restart it.

## Trade-offs

- This leans on the SSH add-on with Protection mode off — a real loosening of
  that appliance's security posture. Fine for a home lab; know the trade-off.
- More "native" alternative: publish `addon/` as a GitHub add-on **repository**
  and install/update from the HA store (GitOps, no SSH).
