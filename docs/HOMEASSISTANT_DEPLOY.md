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

| Path                   | What                                              |
| ---------------------- | ------------------------------------------------- |
| `addon/`               | The Home Assistant add-on (Docker + bundled app)  |
| `addon/src/ha.tsx`     | HA binding: `useEntity`, `callHassService`        |
| `addon/src/clock.tsx`  | Example widget (clock + live temperature)         |
| `infra/deploy.ts`      | Plain Bun deploy/destroy script (works today)     |
| `infra/HassAddon.ts`   | Alchemy v2 custom resource (reference/experiment) |
| `infra/alchemy.run.ts` | Alchemy v2 stack (reference/experiment)           |

## One-time setup on the Pi

1. Install the **Advanced SSH & Web Terminal** add-on.
2. **Protection mode OFF** (exposes the `ha` CLI and `/addons`).
3. Add your SSH public key to that add-on's config.

## Deploy

```bash
cd infra
bun run deploy     # builds addon/staging, syncs it, (re)starts the add-on
```

Then set the add-on's `awtrix_host` option (Settings → Add-ons → React AWTRIX →
Configuration) to your device IP and restart it.

> `deploy.ts` is a plain Bun script that works today. The Alchemy v2 versions
> (`HassAddon.ts` / `alchemy.run.ts`) are kept as a reference of the same logic
> as a custom resource — Alchemy v2 isn't installable from npm yet (see
> `infra/README.md`).

## Authoring widgets

Add a component under `addon/src/`, read any entity with `useEntity("domain.x")`,
and register it in `addon/src/main.tsx`:

```tsx
runtime.app("standup", <NextMeeting />);
```

Re-deploy with `bun run deploy`. Components re-render on HA state changes and the
runtime pushes the diff to the device.

## Trade-offs

- The custom-resource deploy needs the SSH add-on with Protection mode off.
  The more locked-down alternative is GitOps: publish `addon/` as a GitHub
  add-on repository and install/update from the HA store.
- Alchemy v2 isn't installable from npm yet (the current publish is a broken
  pipeline build), so the deploy runs via `deploy.ts` today; the custom-resource
  version is reference code for when v2 ships.
