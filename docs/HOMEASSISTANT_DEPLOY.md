# Deploying react-awtrix to a Home Assistant OS Pi

This is the end-to-end design for running react-awtrix on a Raspberry Pi that
runs **Home Assistant OS**, using Home Assistant itself as the integration layer
and a custom Alchemy v2 resource for declarative deploys.

## Why this shape

- **Home Assistant is the "connectors."** It already integrates with thousands
  of services and exposes everything over a WebSocket API. You get n8n-style
  breadth without the drag-and-drop — you write React components, not node graphs.
- **The clock stays on the LAN.** Nothing is exposed to the internet. The add-on
  connects _out_ to the Supervisor proxy and pushes to the device over the LAN.
- **HAOS is an appliance.** No host `apt`/`systemd` for your own services, so the
  deploy unit is a Home Assistant **add-on** (a container the Supervisor manages).

```
Pi (Home Assistant OS)
┌───────────────────────────────────────────────────────────┐
│  Home Assistant Core ── thousands of integrations           │
│        ▲ ws://supervisor/core/websocket  (SUPERVISOR_TOKEN) │
│        │                                                     │
│  react_awtrix add-on (container, this repo's addon/)        │
│    • useEntity() subscribes to HA state                     │
│    • react-awtrix renders → AWTRIX payload                  │
│        │ http://<awtrix_host>                               │
└────────┼───────────────────────────────────────────────────┘
         ▼
      AWTRIX 3
```

Deploys are driven from your dev machine:

```
dev machine ── alchemy deploy ──ssh──▶ Pi: rsync /addons + `ha addons …`
```

## Layout

| Path                   | What                                               |
| ---------------------- | -------------------------------------------------- |
| `addon/`               | The Home Assistant add-on (Docker + bundled app)   |
| `addon/src/ha.tsx`     | HA binding: `useEntity`, `callHassService`         |
| `addon/src/clock.tsx`  | Example widget (clock + live temperature)          |
| `infra/alchemy.run.ts` | Alchemy v2 stack (`Alchemy.Stack` + `localState`)  |
| `infra/HassAddon.ts`   | Alchemy v2 custom resource (reconcile/delete/read) |
| `infra/deploy.ts`      | Zero-dependency Bun deploy script (same logic)     |

## Development workflow

Three tiers, fastest first:

1. **Local hot-reload** (`cd addon && bun run dev`) — the runtime runs on your
   machine against the real AWTRIX + HA over the LAN, with `bun --hot`. Tightest
   loop; no Pi, no Docker. Auth via `HASS_URL`/`HASS_TOKEN` (see `addon/.env`).
2. **On-device dev build** (`cd infra && bun run deploy:script`) — rsyncs your
   working tree into `/addons` and the Supervisor builds + runs it as a real
   add-on (exercises the container + `SUPERVISOR_TOKEN` path). No publish.
3. **Permanent release** — bump `version` in `addon/config.yaml`, merge to
   `main`; CI publishes the prebuilt image to GHCR and the store offers the
   update.

## One-time setup on the Pi

1. Install the **Advanced SSH & Web Terminal** add-on.
2. **Protection mode OFF** (exposes the `ha` CLI and `/addons`).
3. Add your SSH public key to that add-on's config.

## Deploy

```bash
cd infra
bun install
bun run deploy     # builds addon/staging, syncs it, (re)starts the add-on
```

Then set the add-on's `awtrix_host` option (Settings → Add-ons → React AWTRIX →
Configuration) to your device IP and restart it.

> The Alchemy v2 path uses local state (no Cloudflare). Pin `alchemy` to exactly
> `2.0.0-beta.52` with `effect@^4` — see `infra/README.md`. Prefer no deps?
> `bun run deploy:script` does the same build/sync/restart via `deploy.ts`.

## Authoring widgets

Add a component under `addon/src/`, read any entity with `useEntity("domain.x")`,
and register it in `addon/src/main.tsx`:

```tsx
runtime.app("standup", <NextMeeting />);
```

Re-deploy with `bun run deploy`. Components re-render on HA state changes and the
runtime pushes the diff to the device.

## Trade-offs

- Two distribution models, both wired up:
  - **GitOps (recommended):** CI (`.github/workflows/build-addon.yaml`) builds
    multi-arch images to GHCR and `repository.yaml` makes this an HA add-on
    repository — add the repo URL in HA and install/update from the store, no SSH.
    See `addon/README.md`.
  - **SSH / Alchemy local build:** the custom-resource deploy needs the SSH
    add-on with Protection mode off — handy for dev (builds your changes locally
    without waiting for CI).
- Alchemy v2 is in beta — pin `alchemy` to exactly `2.0.0-beta.52` (a caret
  range resolves to a broken interim build) and use Effect 4.
