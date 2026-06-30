# Credentials

The addon's credential subsystem: how API keys and OAuth tokens for external
services (GitHub, Spotify, WakaTime…) are described, stored, and attached to
outgoing requests so React apps can render data on the AWTRIX clock.

## Language

**Credential**:
One connected integration's complete state — all its config fields and tokens —
held in a single encrypted record, keyed by credential type.
_Avoid_: Secret (as an entity), account, connection-record.

**Credential Type**:
The declarative description of a service: its fields, how to authenticate, and
an optional validation request. Data, not code. (n8n's `ICredentialType`.)
_Avoid_: provider, integration-class.

**Secret**:
Used only as an adjective for a *field* that is write-only and masked in
responses (e.g. an API key). Not a stored entity.

**Auth Method**:
How a Credential Type attaches itself to a request. One of: `apiKey` (static
header/query injection, e.g. WakaTime) or `oauth2-code` (Authorization Code via
arctic with a CLI-hosted `127.0.0.1` loopback callback — GitHub and Spotify both
use this; PKCE for public clients, client_secret for confidential ones).

**Connect**:
The act of running a Credential Type's auth flow to mint and store a Credential.
Driven by the `creds` CLI. The browser-approval step is the only unavoidable
human action.
_Avoid_: login, authorize (as the whole flow), link.

**Control Plane**:
How a Credential gets written to disk: the `creds` CLI → the addon's
token-authed HTTP API → the encrypted store. Distinct from the runtime, which
only *reads* stored Credentials to inject auth into outgoing requests.

## Relationships

- A **Credential** is an instance of exactly one **Credential Type**.
- A **Credential Type** declares **Fields** and exactly one **Auth Method**.
- **Connect** produces a **Credential**; the runtime consumes it.

## Flagged decisions (see docs/adr/)

- Single encrypted Credential record + registry of declarative Credential Types,
  modeled on n8n. (Replaces the two-tier Secret/Credential split.)
- Control plane is the `creds` CLI over a token-authed LAN API; the addon's web
  UI and HA ingress are removed. OAuth callbacks land on a CLI-hosted
  `127.0.0.1` loopback (native-app pattern), never on the addon.

## Flagged ambiguities

- "Secret" was both a stored entity (the OAuth client_id) and a credential's
  token. Resolved: there is no Secret entity — a Credential holds all fields and
  tokens in one record; "secret" only flags a masked field.
