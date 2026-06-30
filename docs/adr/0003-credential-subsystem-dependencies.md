# Dependencies for the credential subsystem (deviating from Bun-native-first)

The repo's CLAUDE.md says to prefer Bun built-ins and avoid dependencies. For the
credential subsystem we deliberately add four small, fetch-based, tree-shakeable
packages because hand-rolling their behavior was the source of the unreadable
code we're replacing:

- **arctic** — OAuth 2.0 authorization-code clients (GitHub, Spotify, ~50 more),
  PKCE, refresh, typed errors. Replaces the bespoke per-provider flow code.
  Note: arctic supports *only* the authorization-code flow, which is why GitHub
  drops device flow and unifies on `oauth2-code` (see ADR 0001/0002).
- **ofetch** — the `authenticatedFetch` client: `onRequest` injects auth,
  `onResponseError` handles 401, built-in retry. Replaces a hand-written wrapper.
- **citty** — the `creds` CLI: typed nested subcommands, zero-dep.
- **open** — launches the browser in the loopback connect flow.

What stays Bun-native, per the guidance: `Bun.serve` for the API and the loopback
listener (no server framework), `node:crypto` for at-rest encryption, and arktype
(already a workspace dependency) for validation.

## Why record this

Without context, a reader following CLAUDE.md would see these deps as a mistake
and try to "fix" them back to hand-rolled Bun code — re-introducing exactly the
complexity this refactor removed. The trade-off (readability + correctness of
OAuth/HTTP edge cases vs. dependency count) was made on purpose.
