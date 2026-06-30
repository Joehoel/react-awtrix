# CLI control plane over a token-authed LAN API; no web UI; loopback OAuth

Credentials are managed by a `creds` CLI that talks to the addon's HTTP API,
which **owns all writes** (single writer, no file races, live apps see new
credentials immediately). The previous React web UI and HA **ingress are
removed**: the addon exposes port 8099 directly (`config.yaml` `ports`) and
requires a `Authorization: Bearer` token on every `/api` call. The token comes
from an addon option / `REACT_AWTRIX_API_TOKEN` env, so dev (`.env`) and prod use
one auth path and the CLI can target either via `REACT_AWTRIX_API`.

OAuth callbacks never land on the addon. For `oauth2-code` (GitHub and Spotify),
the CLI hosts a `http://127.0.0.1:8765/cb` listener on the user's machine (the
native-app pattern used by `gh`/`gcloud`) and runs the browser flow. The server
generates state/PKCE verifier and does the token exchange (arctic), so the
**client_secret and verifier never leave the addon** — the CLI only relays the
authorization `code` back. This is forced by Spotify accepting only `https` or
`http://127.0.0.1` redirects while the HA ingress URL is a dynamic, per-session
path that cannot be registered. The loopback port is fixed (8765) because
GitHub/Spotify require an exact registered redirect URI.

## Considered options

- **Keep ingress + a web UI**: rejected — the UI was unwanted convenience, and
  ingress's browser-session auth is awkward to script for a CLI/agent.
- **Addon hosts its own OAuth callback** (via ingress or a tunnel): rejected —
  needs a stable registrable https URL the addon doesn't have.
- **Unauthenticated LAN port**: rejected — exposes a credential-write API on the
  network.

## Consequences

- HA manifest loses `ingress`/`panel_*`; the addon is reached by IP:port.
- The `oauth2-code` CLI verb is not a thin HTTP client — it briefly hosts a
  local listener and drives a browser. `apiKey` and `oauth2-device` stay thin.
- `127.0.0.1:PORT` must be registered once in each OAuth app.
