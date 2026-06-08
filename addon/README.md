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

## Local development

`react-awtrix` is resolved from the parent repo source (see `tsconfig.json`
`paths`), so you only install the runtime deps here:

```bash
cd addon
bun install
AWTRIX_HOST=192.168.1.45 HASS_URL=http://homeassistant.local:8123 \
  HASS_TOKEN=<long-lived-token> bun run dev
```

> For local dev outside the Supervisor there is no `SUPERVISOR_TOKEN`. Either
> point `ha.tsx` at `createLongLivedTokenAuth(HASS_URL, HASS_TOKEN)`, or just run
> it inside the add-on where the proxy is available.

## Build the deployable bundle

```bash
bun run build      # writes staging/main.js, staging/config.yaml, staging/Dockerfile
```

## Deploy

Deployment is declarative — see [`../infra`](../infra). It rsyncs `staging/`
into `/addons/react_awtrix` on the Pi and drives the Supervisor (`ha addons …`).

To do it by hand instead: copy `staging/` to `/addons/react_awtrix/` on the Pi
(via the Samba or SSH add-on), then **Settings → Add-ons → ⋮ → Check for
updates** and install the new local add-on.

## Notes

- `homeassistant_api: true` is what grants `SUPERVISOR_TOKEN` and the
  `ws://supervisor/core/websocket` proxy. Don't remove it.
- The bundle is a single self-contained `main.js` (~800 KB). It includes the
  library's MQTT re-export as dead code (never instantiated — the clock uses
  HTTP); harmless, just unused weight.
- Reaching the AWTRIX device uses normal container egress; no `host_network`
  needed for outbound HTTP.
