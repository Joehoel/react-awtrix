# react-awtrix Home Assistant add-on

Runs the react-awtrix runtime as a Home Assistant **local add-on**. Components
subscribe to Home Assistant state via `useEntity()` and render to your AWTRIX 3
clock on the LAN. Authentication uses the Supervisor's injected
`SUPERVISOR_TOKEN` — no long-lived token, nothing exposed to the internet.

```
addon/
├─ config.yaml      # HA add-on manifest (homeassistant_api: true)
├─ Dockerfile       # runs the bundled app on oven/bun
├─ build.ts         # bundles src/ -> staging/main.js + manifest
├─ src/
│  ├─ main.tsx      # entrypoint: createRuntime + register apps
│  ├─ ha.tsx        # Home Assistant binding (useEntity / callHassService)
│  └─ clock.tsx     # example: clock + live temperature
└─ staging/         # build output, rsynced to /addons/react_awtrix (gitignored)
```

## Local development (fast inner loop)

Run the runtime on your machine with hot reload, pointed at the real AWTRIX and
Home Assistant on your LAN. Edit a component, save, watch the pixels update.

```bash
cd addon
bun install
cp .env.example .env   # set AWTRIX_HOST, HASS_URL, HASS_TOKEN
bun run dev            # bun --hot src/main.tsx
```

`ha.tsx` uses `SUPERVISOR_TOKEN` when running as an add-on, and falls back to
`HASS_URL` + `HASS_TOKEN` (a long-lived token) for local dev — the same code
runs in both places. `react-awtrix` is resolved from the parent repo source via
the `tsconfig.json` `paths` alias, so no publishing is needed.

## Build the deployable bundle

```bash
bun run build      # writes staging/main.js, staging/config.yaml, staging/Dockerfile
```

## Deploy

Two ways:

### A. Install from the Home Assistant store (CI-published) — recommended

CI (`.github/workflows/build-addon.yaml`) builds multi-arch images and pushes
them to GHCR, and the repo root has a `repository.yaml`, so this is a real HA
add-on repository:

1. In Home Assistant: **Settings → Add-ons → Add-on Store → ⋮ → Repositories**,
   add `https://github.com/Joehoel/react-awtrix`.
2. Install **React AWTRIX** from the store; set the `awtrix_host` option; start.

Updates ship by bumping `version` in `config.yaml` and merging to `main` — the
Supervisor then offers the update. (One-time: after the first publish, make the
GHCR package **public** in GitHub so the Supervisor can pull it without auth.)

### B. SSH / Alchemy local deploy (dev) — see [`../infra`](../infra)

Builds locally on the Pi from the Dockerfile (the staged `config.yaml` has its
`image:` stripped), so you can iterate without waiting for CI. It rsyncs
`staging/` into `/addons/react_awtrix` and drives the Supervisor (`ha addons …`).

## Notes

- `homeassistant_api: true` is what grants `SUPERVISOR_TOKEN` and the
  `ws://supervisor/core/websocket` proxy. Don't remove it.
- The bundle is a single self-contained `main.js` (~800 KB). It includes the
  library's MQTT re-export as dead code (never instantiated — the clock uses
  HTTP); harmless, just unused weight.
- Reaching the AWTRIX device uses normal container egress; no `host_network`
  needed for outbound HTTP.
