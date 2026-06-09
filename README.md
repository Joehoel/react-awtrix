# react-awtrix monorepo

Bun-workspaces monorepo for the [Awtrix 3](https://github.com/Blueforcer/awtrix3)
React renderer and its Home Assistant deployment.

| Path                     | What                                                                 |
| ------------------------ | ------------------------------------------------------------------- |
| `packages/react-awtrix/` | The library — a React renderer for AWTRIX 3 ([README](packages/react-awtrix/README.md)) |
| `addon/`                 | Home Assistant add-on that renders to a device, driven by HA state   |
| `infra/`                 | Alchemy v2 stack that declaratively deploys the add-on to the Pi     |
| `docs/`                  | Architecture & deployment notes                                      |

> `addon/` is intentionally a top-level directory: Home Assistant only discovers
> add-ons in a repository's top-level folders.

## Develop

```bash
bun install                 # one install for the whole workspace

bun run --filter react-awtrix check     # lib: typecheck + lint + format + knip
bun run --filter react-awtrix test      # lib tests

cd addon && bun run dev     # hot-reload the add-on locally (see addon/README.md)
cd infra && bun run deploy  # deploy to the Pi (see infra/README.md)
```

The library is strict (typecheck/lint/format/knip in CI); the app sub-projects
carry their own lightweight toolchains. See `docs/HOMEASSISTANT_DEPLOY.md` for
the full dev → release workflow.
