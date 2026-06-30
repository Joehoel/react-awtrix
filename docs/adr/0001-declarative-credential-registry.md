# Declarative credential registry with a single encrypted record

We model credentials on n8n: each service is a **declarative Credential Type**
(fields + one auth method + optional test request — data, not code) held in a
registry, and each connected integration is **one encrypted record** holding all
its fields and tokens together, keyed by credential type (one per type).

This replaces the earlier two-tier split (a separate `Secret` entity for the
OAuth client_id plus a `Credential` for the token) and the bespoke per-service
provider classes (e.g. the ~280-line `github.ts`). Adding a new service becomes
writing a ~15-line descriptor with zero flow code, so an AI agent can add
integrations with no human step.

Auth is two mechanisms chosen by the descriptor — `apiKey` (static injection) and
`oauth2-code` (Authorization Code via the arctic library) — mirroring how n8n
branches on parent credential type. GitHub and Spotify both use `oauth2-code`;
the bespoke GitHub device flow is removed (see ADR 0003). Field definitions and
provider token-response parsing use arktype (the existing workspace validator),
replacing hand-rolled `typeof` guards.

## Considered options

- **Two-tier Secret + Credential** (the prior shape): rejected — the indirection
  buys cross-credential secret sharing we don't need (one OAuth app per service,
  personal scale); n8n itself stores everything in one blob.
- **Bespoke provider classes per service**: rejected — it's the status quo that
  made adding Spotify/WakaTime a copy-paste of flow logic; the whole point is to
  make services data.
